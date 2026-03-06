"""
PDF Generation Integration
Uses OpenAI gpt-4o-mini (single large-context call) for content generation.
Falls back to Groq LLaMA chunk-by-chunk if OpenAI fails.
"""
import sys
import os
import re
from pathlib import Path
from django.conf import settings
from django.core.files import File
import logging

from openai import OpenAI
from groq import Groq

logger = logging.getLogger(__name__)

# Add the existing scripts directory to Python path
SCRIPTS_DIR = Path(settings.BASE_DIR).parent / 'Video-Knowledge-Extraction-Semantic-Search-System-RAG-based-'
sys.path.insert(0, str(SCRIPTS_DIR))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _format_seconds(seconds):
    """Convert seconds to mm:ss or hh:mm:ss format."""
    try:
        total_seconds = int(float(seconds))
    except (TypeError, ValueError):
        return "00:00"

    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def _build_prompt(raw_text):
    """Build the prompt that processes the entire transcript in a single API call."""
    return f"""You are a senior technical educator writing premium course material from a video transcript.

Your output must be content-focused, complete, and very high quality.
Do not skip any idea mentioned in the transcript.
Do not write Q&A sections.
Do not add markdown symbols outside of code blocks.

Length and depth requirements:
- Produce substantial detail for each topic.
- For each TOPIC include rich explanation with practical framing.
- Target long-form instructional content, not short notes.
- If multiple micro-topics exist, split into separate TOPIC entries.
- Aim to cover the ENTIRE transcript — do not stop early.

Required output format (repeat SECTION/TOPIC blocks to cover all content):
SECTION: [Main section name]
TOPIC: 1. [Topic name]
Concept: [Clear and deep explanation]
Context: [How this fits in the flow of the lesson]
Explanation: [Detailed teaching-style explanation]
Example: [Concrete practical example]
Implementation Notes: [Best practices, edge cases, caveats]
TOPIC: 2. ...

After all topics, end with exactly these two sections:

SECTION: Final Summary
[A comprehensive, meaningful closing summary of the entire video content. Focus on how topics connect.]

KEY TAKEAWAYS:
[12 to 18 high-quality, concrete takeaways, one per line starting with -]

When coding is present in transcript:
- Include at least one realistic code example.
- Put code examples inside fenced code blocks using triple backticks.
- Use language tags like ```python or ```javascript when clear.
- Every code example must be complete and self-contained.
- Never reference undefined variables.
- Include imports and variable initialization before usage.
- Add a short output line as a comment at the end (for example: # Output: ...).
- Do not provide pseudo-code; provide executable-style code.

Writing requirements:
- Keep language precise, professional, and readable.
- Expand meaningfully, not with filler text.
- Preserve all technical details and nuances from the transcript.

Full transcript:
<<<
{raw_text}
>>>
"""


# ---------------------------------------------------------------------------
# OpenAI-based generation (primary)
# ---------------------------------------------------------------------------

def _generate_with_openai(raw_text):
    """
    Send the entire transcript to OpenAI gpt-4o-mini in a single call.
    gpt-4o-mini supports a 128k-token context window, so even long transcripts
    fit comfortably in one request.
    Returns the generated content string.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise EnvironmentError("OPENAI_API_KEY is not set in environment / .env")

    client = OpenAI(api_key=api_key)
    model = os.getenv("OPENAI_PDF_MODEL", "gpt-4o-mini")

    prompt = _build_prompt(raw_text)

    logger.info(f"Calling OpenAI {model} with full transcript ({len(raw_text):,} chars)...")

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=8192,
        )
        result = response.choices[0].message.content.strip()
        logger.info(f"OpenAI response received: {len(result):,} chars")
        return result
    except Exception as e:
        logger.error(f"OpenAI PDF generation error: {e}", exc_info=True)
        raise


# ---------------------------------------------------------------------------
# Groq fallback (chunk-by-chunk, same as original)
# ---------------------------------------------------------------------------

def _format_seconds_for_chunk(chunks, idx, total_token_chunks):
    """Get time hint for a chunk index."""
    if not chunks:
        return None, None
    chunk_span = max(1, len(chunks) // total_token_chunks)
    start_index = min(len(chunks) - 1, idx * chunk_span)
    end_index = min(len(chunks) - 1, (idx + 1) * chunk_span - 1)
    return (
        _format_seconds(chunks[start_index].get("start")),
        _format_seconds(chunks[end_index].get("end")),
    )


def _generate_chunk_content_groq(client, model, chunk_text, idx, total, start_hint=None, end_hint=None):
    """Generate content for a single chunk using Groq (fallback)."""
    time_hint = ""
    if start_hint and end_hint:
        time_hint = f"\nChunk timeline: {start_hint} to {end_hint}\n"

    prompt = f"""
You are a senior technical educator writing premium course material from a transcript.

Your output must be content-focused, complete, and very high quality.
Do not skip any idea mentioned in this chunk.
Do not write Q&A sections.
Do not add markdown symbols.

Required output format:
SECTION: [Main section name]
TOPIC: 1. [Topic name]
Concept: [Clear and deep explanation]
Context: [How this fits in the flow of the lesson]
Explanation: [Detailed teaching-style explanation]
Example: [Concrete practical example]
Implementation Notes: [Best practices, edge cases, caveats]
TOPIC: 2. ...
Repeat to cover every distinct topic in this chunk.

When coding is present in transcript:
- Include at least one realistic code example.
- Put code examples inside fenced code blocks using triple backticks.
- Every code example must be complete and self-contained.

Chunk {idx}/{total}
{time_hint}

Transcript chunk:
<<<
{chunk_text}
>>>
"""
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=2200,
    )
    return response.choices[0].message.content.strip()


def _generate_final_sections_groq(client, model, raw_text):
    """Generate Final Summary and Key Takeaways using Groq (fallback)."""
    excerpt = raw_text[:14000]
    prompt = f"""
Create only the final two sections for a course PDF.

Required output format:
SECTION: Final Summary
- Write a comprehensive, meaningful closing summary of the entire video content.

KEY TAKEAWAYS:
- Provide 12 to 18 high-quality, concrete takeaways.

Rules:
- No Q&A format. No fluff. Plain text only.

Source excerpt:
<<<
{excerpt}
>>>
"""
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.25,
        max_tokens=1800,
    )
    return response.choices[0].message.content.strip()


def _generate_with_groq_fallback(raw_text, transcript_chunks, enhance_and_pdf):
    """
    Chunk-by-chunk Groq generation — used only when OpenAI fails.
    Preserves the original logic exactly.
    """
    model = os.getenv("GROQ_PDF_MODEL", "llama-3.3-70b-versatile")
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))

    max_tokens = int(os.getenv("PDF_CHUNK_MAX_TOKENS", "2400"))
    overlap_tokens = int(os.getenv("PDF_CHUNK_OVERLAP_TOKENS", "240"))
    token_chunks = enhance_and_pdf.split_text_by_tokens(
        raw_text, max_tokens=max_tokens, overlap=overlap_tokens
    )

    logger.info(f"[Groq fallback] Processing {len(token_chunks)} chunks sequentially...")

    chunk_notes = [""] * len(token_chunks)
    for idx, chunk_text in enumerate(token_chunks):
        start_hint, end_hint = _format_seconds_for_chunk(transcript_chunks, idx, len(token_chunks))
        logger.info(f"  [Groq fallback] Chunk {idx + 1}/{len(token_chunks)}")
        try:
            chunk_notes[idx] = _generate_chunk_content_groq(
                client, model, chunk_text, idx + 1, len(token_chunks), start_hint, end_hint
            )
        except Exception as e:
            logger.warning(f"  Groq chunk {idx + 1} failed: {e}. Using plain text.")
            chunk_notes[idx] = enhance_and_pdf.beautify_text(chunk_text)

    merged = []
    for idx, content in enumerate(chunk_notes, start=1):
        merged.append(f"SECTION: Transcript Coverage Part {idx}")
        merged.append(content)

    try:
        final_sections = _generate_final_sections_groq(client, model, raw_text)
        merged.append(final_sections)
    except Exception as e:
        logger.warning(f"Final sections generation failed: {e}")

    return "\n\n".join(merged)


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------

def _generate_pdf_content(raw_text, transcript_chunks, enhance_and_pdf):
    """
    Try OpenAI gpt-4o-mini first (entire transcript, single call — 128k context).
    Fall back to Groq LLaMA chunk-by-chunk if OpenAI fails.
    """
    # --- Primary: OpenAI gpt-4o-mini ---
    try:
        content = _generate_with_openai(raw_text)
        logger.info("PDF content generated successfully via OpenAI gpt-4o-mini.")
        return content
    except Exception as openai_err:
        logger.warning(
            f"OpenAI PDF generation failed ({openai_err}). "
            "Falling back to Groq chunk-by-chunk processing..."
        )

    # --- Fallback: Groq LLaMA ---
    try:
        content = _generate_with_groq_fallback(raw_text, transcript_chunks, enhance_and_pdf)
        logger.info("PDF content generated successfully via Groq fallback.")
        return content
    except Exception as groq_err:
        logger.error(f"Groq fallback also failed: {groq_err}", exc_info=True)
        # Last resort: plain beautified text — PDF will still be created
        logger.warning("Using plain beautify_text as last-resort fallback.")
        chunks = enhance_and_pdf.split_text_by_tokens(raw_text)
        parts = [enhance_and_pdf.beautify_text(c) for c in chunks]
        return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def generate_pdf(video_id):
    """
    Generate PDF for a video.
    Returns PDF model instance.
    """
    from api.models import Video, PDF
    import enhance_and_pdf
    import json

    try:
        video = Video.objects.get(id=video_id)
        logger.info(f"Generating PDF for video ID: {video_id}, title: {video.title}")

        if video.status not in ["completed", "processing"]:
            raise ValueError(f"Video status must be completed or processing, found: {video.status}")

        # Locate the JSON transcript file
        json_dir = SCRIPTS_DIR / "jsons"
        import pipelIne_api

        video_filename = Path(video.file.name).name
        base_name = pipelIne_api.clean_filename(video_filename.rsplit(".", 1)[0])
        json_filename = f"0_{base_name}.mp3.json"
        json_path = json_dir / json_filename

        if not json_path.exists():
            logger.warning(f"JSON not found at {json_path}, searching for fallback...")
            json_files = list(json_dir.glob(f"*{base_name}*.json"))
            if not json_files:
                raise FileNotFoundError(f"No JSON file found for video: {base_name}")
            json_path = json_files[0]
            logger.warning(f"Using fallback JSON: {json_path}")

        logger.info(f"Using JSON file: {json_path}")

        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)

        raw_text = data.get("text", "").strip()
        if not raw_text:
            raise ValueError("No text found in JSON transcript file")

        transcript_chunks = data.get("chunks", [])
        logger.info(f"Transcript loaded: {len(raw_text):,} chars, {len(transcript_chunks)} segments")

        # Generate AI-enhanced content (OpenAI → Groq fallback → plain text)
        logger.info("Starting PDF content generation...")
        enhanced_text = _generate_pdf_content(raw_text, transcript_chunks, enhance_and_pdf)
        logger.info("PDF content generation complete.")

        # Build the PDF with ReportLab (unchanged)
        video_title = base_name.replace("_", " ").title()
        pdf_filename = f"{video_title}.pdf"
        pdf_path = settings.MEDIA_ROOT / "pdfs" / pdf_filename
        pdf_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"Building PDF at: {pdf_path}")
        enhance_and_pdf.create_pdf(video_title, enhanced_text, str(pdf_path))
        logger.info("PDF file created successfully.")

        # Persist to database
        pdf_obj, created = PDF.objects.get_or_create(
            video=video,
            defaults={"file_size_bytes": os.path.getsize(pdf_path)},
        )
        with open(pdf_path, "rb") as f:
            pdf_obj.file.save(pdf_filename, File(f), save=True)

        pdf_obj.file_size_bytes = os.path.getsize(pdf_path)
        pdf_obj.save(update_fields=["file_size_bytes"])

        # Update user profile stats
        from api.models import UserProfile
        profile, _ = UserProfile.objects.get_or_create(user=video.user)
        profile.total_pdfs = PDF.objects.filter(video__user=video.user).count()
        profile.save()

        logger.info(f"PDF generation completed for video ID: {video_id}")
        return pdf_obj

    except Exception as e:
        logger.error(f"Error generating PDF for video {video_id}: {e}", exc_info=True)
        raise
