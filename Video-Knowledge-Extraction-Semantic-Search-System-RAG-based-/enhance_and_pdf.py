import os
import re
import json
import time
import tiktoken
from groq import Groq
from dotenv import load_dotenv
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle, Preformatted
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

load_dotenv()

# --------------------------
# TIMER
# --------------------------
start_time = time.perf_counter()

# --------------------------
# GROQ CONFIG
# --------------------------
GROQ_MODEL = "llama-3.1-8b-instant"
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# --------------------------
# DIRECTORIES
# --------------------------
JSON_DIR = "jsons"
PDF_DIR = "pdfs"
os.makedirs(PDF_DIR, exist_ok=True)

# --------------------------
# REGISTER EMOJI-CAPABLE FONT
# --------------------------
# Try to register a system font that supports emojis / extended Unicode.
# Falls back to Helvetica if none found.
_EMOJI_FONT_REGISTERED = False
_EMOJI_FONT_NAME = "Helvetica"
_EMOJI_FONT_BOLD = "Helvetica-Bold"

def _register_emoji_font():
    """Try to register Segoe UI (Windows) or DejaVu Sans for emoji support."""
    global _EMOJI_FONT_REGISTERED, _EMOJI_FONT_NAME, _EMOJI_FONT_BOLD
    if _EMOJI_FONT_REGISTERED:
        return

    font_candidates = [
        # Windows
        ("SegoeUI", "C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/segoeuib.ttf"),
        ("DejaVuSans", "C:/Windows/Fonts/DejaVuSans.ttf", "C:/Windows/Fonts/DejaVuSans-Bold.ttf"),
        # Common Linux paths
        ("DejaVuSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ]

    for name, regular_path, bold_path in font_candidates:
        if os.path.exists(regular_path):
            try:
                pdfmetrics.registerFont(TTFont(name, regular_path))
                bold_name = f"{name}-Bold"
                if os.path.exists(bold_path):
                    pdfmetrics.registerFont(TTFont(bold_name, bold_path))
                else:
                    bold_name = name  # fallback bold to regular
                _EMOJI_FONT_NAME = name
                _EMOJI_FONT_BOLD = bold_name
                _EMOJI_FONT_REGISTERED = True
                return
            except Exception:
                continue

    # Fallback — no special font found
    _EMOJI_FONT_REGISTERED = True

_register_emoji_font()

styles = getSampleStyleSheet()

# --------------------------
# COLOR PALETTE
# --------------------------
COLOR_TITLE_BG    = HexColor("#1d4ed8")   # Blue banner
COLOR_TITLE_TEXT  = HexColor("#ffffff")   # White title text
COLOR_HEADING     = HexColor("#1e3a8a")   # Deep blue headings
COLOR_SUBHEADING  = HexColor("#1d4ed8")   # Medium blue sub-headings
COLOR_BODY        = HexColor("#111111")   # Black body text
COLOR_ACCENT      = HexColor("#3b82f6")   # Bright blue accent
COLOR_MUTED       = HexColor("#64748b")   # Neutral muted captions
COLOR_DIVIDER     = HexColor("#d1d5db")   # Light gray divider
COLOR_PAGE_STRIPE = HexColor("#1d4ed8")   # Blue stripe
COLOR_SURFACE     = HexColor("#f3f4f6")   # Light gray surface blocks
COLOR_SURFACE_ALT = HexColor("#f9fafb")   # Very light gray surface
COLOR_SUCCESS_BG  = HexColor("#f3f4f6")   # Neutral takeaway background
COLOR_SUCCESS_TXT = HexColor("#111111")   # Black takeaway text


# --------------------------
# TOKEN-AWARE SPLITTING (GROQ SAFE)
# --------------------------
def split_text_by_tokens(text, max_tokens=3000, overlap=200):
    enc = tiktoken.get_encoding("cl100k_base")
    tokens = enc.encode(text)

    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + max_tokens, len(tokens))
        chunks.append(enc.decode(tokens[start:end]))
        if end == len(tokens):
            break
        start += max_tokens - overlap

    return chunks


# --------------------------
# GROQ LLM ENHANCEMENT
# --------------------------
def beautify_text(raw_text: str) -> str:
    prompt = f"""
You are an expert University Professor creating a high-quality, comprehensive Course Guide.
Your task is to transform the provided transcript segment into clear, valuable study material.

CRITICAL RULE - COMPLETE COVERAGE (ZERO SKIPPING):
The user has demanded that NO TOPIC BE SKIPPED.
  - Cover Everything: If a concept, fact, or side-note is in the transcript, it must be in your output.
  - Do Not Filter: Do not decide what is important or unimportant. Cover it all.
  - Real Content: Produce genuine, high-utility educational content. No fluff.

TARGET OUTPUT - BALANCED DEPTH (approx 10 pages total):
  - Expand Smartly: Provide clear definitions, examples, and context for every mention.
  - Top-Notch Quality: Use professional formatting and precise language.

FORMATTING RULES (VERY IMPORTANT - FOLLOW EXACTLY):
  - DO NOT use any markdown symbols like *, #, _, ---, or ```.
  - DO NOT use asterisks for bold or emphasis. Instead just write the text plainly.
  - Use SECTION: to label major sections (e.g. "SECTION: Core Concepts").
  - Use TOPIC: to label individual topics (e.g. "TOPIC: 1. Variable Types").
  - Use SUBTOPIC: for smaller sub-sections (e.g. "SUBTOPIC: Integer Overflow").
  - Use "- " (dash space) for bullet points.
  - Use numbered lists like "1. ", "2. " where appropriate.
  - Use "KEY TAKEAWAYS:" for summary sections.
  - Use a few relevant emojis to make the content engaging and visually appealing.
    For example: use a book emoji near section headers, a lightbulb for key insights,
    a check mark for takeaways, a pin for important notes, a rocket for advanced topics.
    Keep emoji usage tasteful, roughly 1-2 per section, not on every line.

Structure for this Segment:

SECTION: Core Subject Analysis
[Organize the segment into logical sub-topics covering ALL points]

TOPIC: 1. [Topic Name]
  Concept: Clear explanation (1-2 paragraphs).
  Context: Why this specific point was mentioned.
  Example: A concrete application.

... [Repeat for EVERY topic found in this segment] ...

KEY TAKEAWAYS:
- Comprehensive summary of all points covered.

Review for Completeness: Before finishing, check: "Did I miss anything from the input?"

Transcript Segment:
<<<
{raw_text}
>>>

GENERATE COMPLETE, TOP-NOTCH COURSE CONTENT:
"""

    response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=8000,
    )

    return response.choices[0].message.content.strip()


# --------------------------
# TEXT CLEANING HELPERS
# --------------------------
def _strip_markdown(text):
    """Remove any residual markdown symbols that the LLM might still produce."""
    # Bold / italic markers
    text = re.sub(r'\*\*\*(.*?)\*\*\*', r'\1', text)
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    text = re.sub(r'\*(.*?)\*', r'\1', text)
    text = re.sub(r'__(.*?)__', r'\1', text)
    text = re.sub(r'_(.*?)_', r'\1', text)
    # Backticks
    text = re.sub(r'`(.*?)`', r'\1', text)
    # Leading hashes
    text = re.sub(r'^#{1,6}\s*', '', text)
    # Horizontal rules
    text = re.sub(r'^-{3,}$', '', text)
    text = re.sub(r'^\*{3,}$', '', text)
    # Stray leftover symbols
    text = text.replace('**', '').replace('__', '')
    return text.strip()


def _safe_xml(text):
    """Escape XML-special characters so ReportLab doesn't choke."""
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    return text


# --------------------------
# PDF CREATION (BEAUTIFIED)
# --------------------------
def create_pdf(title, content, output_path):
    PAGE_W, PAGE_H = A4
    MARGIN_LEFT = 50
    MARGIN_RIGHT = 50
    MARGIN_TOP = 60
    MARGIN_BOTTOM = 55

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=MARGIN_RIGHT,
        leftMargin=MARGIN_LEFT,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
    )

    # ---- Styles ----
    title_style = ParagraphStyle(
        "PDFTitle",
        fontName=_EMOJI_FONT_BOLD,
        fontSize=24,
        leading=30,
        textColor=COLOR_TITLE_TEXT,
        spaceAfter=0,
        alignment=1,  # center
    )

    subtitle_style = ParagraphStyle(
        "PDFSubtitle",
        fontName=_EMOJI_FONT_NAME,
        fontSize=10.5,
        leading=14,
        textColor=HexColor("#dbeafe"),
        spaceAfter=0,
        alignment=1,
    )

    section_style = ParagraphStyle(
        "SectionStyle",
        fontName=_EMOJI_FONT_BOLD,
        fontSize=18,
        leading=24,
        spaceBefore=0,
        spaceAfter=0,
        textColor=COLOR_HEADING,
    )

    topic_style = ParagraphStyle(
        "TopicStyle",
        fontName=_EMOJI_FONT_BOLD,
        fontSize=15,
        leading=20,
        spaceBefore=0,
        spaceAfter=0,
        textColor=COLOR_SUBHEADING,
    )

    subtopic_style = ParagraphStyle(
        "SubTopicStyle",
        fontName=_EMOJI_FONT_BOLD,
        fontSize=13,
        leading=17,
        spaceBefore=2,
        spaceAfter=2,
        textColor=COLOR_SUBHEADING,
        leftIndent=12,
    )

    body_style = ParagraphStyle(
        "BodyStyle",
        fontName=_EMOJI_FONT_NAME,
        fontSize=12.5,
        leading=19,
        spaceAfter=9,
        textColor=COLOR_BODY,
        alignment=0,
    )

    callout_style = ParagraphStyle(
        "CalloutStyle",
        fontName=_EMOJI_FONT_NAME,
        fontSize=12.5,
        leading=19,
        spaceAfter=8,
        textColor=COLOR_BODY,
        leftIndent=2,
    )

    bullet_style = ParagraphStyle(
        "BulletStyle",
        fontName=_EMOJI_FONT_NAME,
        fontSize=12.5,
        leading=18,
        leftIndent=24,
        firstLineIndent=0,
        spaceBefore=2,
        spaceAfter=4,
        textColor=COLOR_BODY,
    )

    numbered_style = ParagraphStyle(
        "NumberedStyle",
        fontName=_EMOJI_FONT_NAME,
        fontSize=12.5,
        leading=18,
        leftIndent=24,
        firstLineIndent=0,
        spaceBefore=2,
        spaceAfter=4,
        textColor=COLOR_BODY,
    )

    takeaway_label_style = ParagraphStyle(
        "TakeawayLabel",
        fontName=_EMOJI_FONT_BOLD,
        fontSize=15,
        leading=20,
        spaceBefore=0,
        spaceAfter=0,
        textColor=COLOR_SUCCESS_TXT,
    )

    code_style = ParagraphStyle(
        "CodeStyle",
        fontName="Courier",
        fontSize=11.8,
        leading=16.5,
        textColor=HexColor("#1e3a8a"),
    )

    # ---- Page decorations ----
    def _page_decorator(canvas, doc):
        canvas.saveState()
        # Top accent stripe
        canvas.setFillColor(COLOR_PAGE_STRIPE)
        canvas.rect(0, PAGE_H - 6, PAGE_W, 6, stroke=0, fill=1)
        # Footer
        canvas.setFont(_EMOJI_FONT_NAME, 8)
        canvas.setFillColor(COLOR_MUTED)
        page_num = canvas.getPageNumber()
        canvas.drawString(MARGIN_LEFT, 28, title)
        canvas.drawRightString(PAGE_W - MARGIN_RIGHT, 28, f"Page {page_num}")
        # Thin footer line
        canvas.setStrokeColor(COLOR_DIVIDER)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN_LEFT, 40, PAGE_W - MARGIN_RIGHT, 40)
        canvas.restoreState()

    # ---- Build story ----
    story = []

    title_card = Table(
        [[
            Paragraph(f"📘 {_safe_xml(title)}", title_style),
            Paragraph("AI-Enhanced Study Guide", subtitle_style),
        ]],
        colWidths=[doc.width],
    )
    title_card.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_TITLE_BG),
        ('BOX', (0, 0), (-1, -1), 1, COLOR_ACCENT),
        ('LEFTPADDING', (0, 0), (-1, -1), 18),
        ('RIGHTPADDING', (0, 0), (-1, -1), 18),
        ('TOPPADDING', (0, 0), (-1, -1), 16),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(Spacer(1, 10))
    story.append(title_card)
    story.append(Spacer(1, 14))

    callout_emoji = {
        "concept": "📘",
        "context": "🧭",
        "example": "🧪",
        "definition": "🧠",
        "important": "📌",
        "note": "📝",
        "insight": "💡",
        "application": "🚀",
        "why": "❓",
    }

    code_lines = []
    in_fenced_code = False

    def _looks_like_code_line(text):
        t = text.strip()
        if not t:
            return False

        semantic_prefixes = (
            "SECTION:", "TOPIC:", "SUBTOPIC:", "KEY TAKEAWAYS",
            "Concept:", "Context:", "Example:", "Definition:",
            "Important:", "Note:", "Insight:", "Application:", "Why:",
        )
        if any(t.startswith(prefix) for prefix in semantic_prefixes):
            return False

        sql_keywords = (
            "SELECT", "CREATE", "INSERT", "UPDATE", "DELETE", "ALTER", "DROP",
            "WITH", "FROM", "WHERE", "JOIN", "GROUP", "ORDER", "HAVING", "LIMIT",
            "UNION", "VALUES", "SET", "PRIMARY", "FOREIGN", "TABLE",
        )
        upper_t = t.upper()
        if any(upper_t == keyword or upper_t.startswith(keyword + " ") for keyword in sql_keywords):
            return True

        code_prefixes = (
            "def ", "class ", "import ", "from ", "return ", "if ", "elif ", "else:",
            "for ", "while ", "try:", "except", "const ", "let ", "var ", "function ",
            "public ", "private ", "protected ", "#include", "using ", "print(", "console.",
        )
        if any(t.startswith(prefix) for prefix in code_prefixes):
            return True

        if re.match(r'^[A-Za-z_][A-Za-z0-9_]*\s*=\s*.+', t):
            return True

        structural_tokens = {"(", ")", "{", "}", "[", "]", ");", "};", ","}
        if t in structural_tokens:
            return True

        if t.endswith((";", "{", "}")):
            return True

        if re.search(r'\b[A-Za-z_][A-Za-z0-9_]*\([^)]*\)', t) and len(t.split()) <= 12:
            return True

        # Strong code operator pattern
        if re.search(r'==|!=|<=|>=|\+=|-=|\*=|/=|=>|::', t):
            return True

        return False

    def _flush_code_block():
        nonlocal code_lines
        if not code_lines:
            return

        # Avoid rendering tiny fragmented snippets as code cards
        trimmed = [line for line in code_lines if line.strip()]
        if len(trimmed) == 1:
            single = trimmed[0].strip()
            meaningful_single = (
                single.endswith((';', ':', '{', '}')) or
                re.search(r'\b(def|class|function|SELECT|INSERT|UPDATE|DELETE|CREATE|import|from)\b', single, re.IGNORECASE)
            )
            if not meaningful_single:
                story.append(Paragraph(_safe_xml(_strip_markdown(single)), body_style))
                code_lines = []
                return

        code_text = "\n".join(code_lines).rstrip()
        code_block = Preformatted(code_text, code_style)

        code_card = Table([[code_block]], colWidths=[doc.width])
        code_card.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), HexColor("#eff6ff")),
            ('BOX', (0, 0), (-1, -1), 0.9, HexColor("#60a5fa")),
            ('LINEBEFORE', (0, 0), (0, 0), 4, HexColor("#1d4ed8")),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ]))

        story.append(Spacer(1, 4))
        story.append(code_card)
        story.append(Spacer(1, 8))
        code_lines = []

    # ---- Parse content line by line ----
    for line in content.split("\n"):
        raw_line = line.rstrip("\n")
        stripped = raw_line.strip()

        if stripped.startswith("```"):
            if in_fenced_code:
                in_fenced_code = False
                _flush_code_block()
            else:
                in_fenced_code = True
            continue

        if in_fenced_code:
            code_lines.append(raw_line)
            continue

        if not stripped:
            _flush_code_block()
            continue

        if _looks_like_code_line(raw_line):
            code_lines.append(raw_line)
            continue

        _flush_code_block()

        cleaned = _strip_markdown(stripped)
        if not cleaned:
            continue

        safe = _safe_xml(cleaned)

        # --- Detect SECTION: ---
        section_match = re.match(r'^SECTION:\s*(.*)', cleaned, re.IGNORECASE)
        if section_match:
            label = _safe_xml(section_match.group(1).strip())
            story.append(Spacer(1, 8))
            section_card = Table([[Paragraph(f"📚 {label}", section_style)]], colWidths=[doc.width])
            section_card.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), COLOR_SURFACE),
                ('LINEBEFORE', (0, 0), (0, 0), 4, COLOR_ACCENT),
                ('BOX', (0, 0), (-1, -1), 0.6, COLOR_DIVIDER),
                ('LEFTPADDING', (0, 0), (-1, -1), 12),
                ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(section_card)
            story.append(Spacer(1, 8))
            continue

        # --- Detect TOPIC: ---
        topic_match = re.match(r'^TOPIC:\s*(.*)', cleaned, re.IGNORECASE)
        if topic_match:
            label = _safe_xml(topic_match.group(1).strip())
            topic_card = Table([[Paragraph(f"🎯 {label}", topic_style)]], colWidths=[doc.width])
            topic_card.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), COLOR_SURFACE_ALT),
                ('LINEBEFORE', (0, 0), (0, 0), 3, COLOR_SUBHEADING),
                ('LEFTPADDING', (0, 0), (-1, -1), 10),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]))
            story.append(topic_card)
            story.append(Spacer(1, 5))
            continue

        # --- Detect SUBTOPIC: ---
        subtopic_match = re.match(r'^SUBTOPIC:\s*(.*)', cleaned, re.IGNORECASE)
        if subtopic_match:
            label = _safe_xml(subtopic_match.group(1).strip())
            story.append(Paragraph(f"🔹 {label}", subtopic_style))
            continue

        # --- Detect KEY TAKEAWAYS: ---
        if re.match(r'^KEY\s*TAKEAWAYS?:', cleaned, re.IGNORECASE):
            # Extract any text after the colon
            after = re.sub(r'^KEY\s*TAKEAWAYS?:\s*', '', cleaned, flags=re.IGNORECASE).strip()
            display = _safe_xml(after) if after else "Key Takeaways"
            takeaway_card = Table([[Paragraph(f"✅ {display}", takeaway_label_style)]], colWidths=[doc.width])
            takeaway_card.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), COLOR_SUCCESS_BG),
                ('LINEBEFORE', (0, 0), (0, 0), 4, COLOR_SUCCESS_TXT),
                ('BOX', (0, 0), (-1, -1), 0.5, HexColor("#d1d5db")),
                ('LEFTPADDING', (0, 0), (-1, -1), 12),
                ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                ('TOPPADDING', (0, 0), (-1, -1), 7),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
            ]))
            story.append(Spacer(1, 6))
            story.append(takeaway_card)
            story.append(Spacer(1, 6))
            continue

        # --- Detect heading-like lines from residual markdown (## / ### / ####) ---
        heading_match = re.match(r'^(#{2,4})\s+(.*)', stripped)
        if heading_match:
            level = len(heading_match.group(1))
            label = _safe_xml(_strip_markdown(heading_match.group(2)))
            if level == 2:
                section_card = Table([[Paragraph(f"📚 {label}", section_style)]], colWidths=[doc.width])
                section_card.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), COLOR_SURFACE),
                    ('LINEBEFORE', (0, 0), (0, 0), 4, COLOR_ACCENT),
                    ('BOX', (0, 0), (-1, -1), 0.6, COLOR_DIVIDER),
                    ('LEFTPADDING', (0, 0), (-1, -1), 12),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                    ('TOPPADDING', (0, 0), (-1, -1), 8),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ]))
                story.append(Spacer(1, 8))
                story.append(section_card)
                story.append(Spacer(1, 8))
            elif level == 3:
                topic_card = Table([[Paragraph(f"🎯 {label}", topic_style)]], colWidths=[doc.width])
                topic_card.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), COLOR_SURFACE_ALT),
                    ('LINEBEFORE', (0, 0), (0, 0), 3, COLOR_SUBHEADING),
                    ('LEFTPADDING', (0, 0), (-1, -1), 10),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ]))
                story.append(topic_card)
                story.append(Spacer(1, 5))
            else:
                story.append(Paragraph(f"🔹 {label}", subtopic_style))
            continue

        callout_match = re.match(
            r'^(Concept|Context|Example|Definition|Important|Note|Insight|Application|Why):\s*(.*)',
            cleaned,
            re.IGNORECASE
        )
        if callout_match:
            label_raw = callout_match.group(1).strip()
            detail_raw = callout_match.group(2).strip()
            label_key = label_raw.lower()
            emoji = callout_emoji.get(label_key, "📘")
            safe_detail = _safe_xml(detail_raw)
            callout_html = (
                f"<font color='#2563eb'><b>{emoji} {label_raw.title()}:</b></font> "
                f"{safe_detail}"
            )
            story.append(Paragraph(callout_html, callout_style))
            continue

        # --- Bullet points ---
        if stripped.startswith("- ") or stripped.startswith("* "):
            bullet_text = _safe_xml(_strip_markdown(stripped[2:]))
            story.append(Paragraph(f"<font color='#111111'>•</font>  {bullet_text}", bullet_style))
            continue

        # --- Numbered list ---
        num_match = re.match(r'^(\d+)\.\s+(.*)', stripped)
        if num_match:
            num = num_match.group(1)
            item_text = _safe_xml(_strip_markdown(num_match.group(2)))
            story.append(Paragraph(f"{num}.  {item_text}", numbered_style))
            continue

        # --- Horizontal rule (---) ---
        if re.match(r'^-{3,}$', stripped) or re.match(r'^\*{3,}$', stripped):
            story.append(HRFlowable(
                width="80%", thickness=0.5, color=COLOR_DIVIDER,
                spaceBefore=8, spaceAfter=8, hAlign='CENTER'
            ))
            continue

        # --- Regular paragraph ---
        story.append(Paragraph(safe, body_style))

    _flush_code_block()

    # ---- Build ----
    doc.build(story, onFirstPage=_page_decorator, onLaterPages=_page_decorator)


# --------------------------
# JSON -> GROQ -> PDF
# --------------------------
def process_json_to_pdf(json_path):
    filename = os.path.splitext(os.path.basename(json_path))[0]
    title = filename.replace("_", " ")
    pdf_path = os.path.join(PDF_DIR, f"{title}.pdf")

    if os.path.exists(pdf_path):
        print(f"SKIP: PDF exists for {filename}")
        return

    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    raw_text = data.get("text", "").strip()
    if not raw_text:
        print(f"WARNING: No text in {filename}")
        return

    print(f"\nEnhancing with Groq AI: {filename}")

    chunks = split_text_by_tokens(raw_text)
    enhanced_parts = []

    for i, chunk in enumerate(chunks, start=1):
        print(f"   -> Processing chunk {i}/{len(chunks)}")
        enhanced_parts.append(beautify_text(chunk))

    enhanced_text = "\n\n".join(enhanced_parts)
    create_pdf(title, enhanced_text, pdf_path)

    print(f"SUCCESS: PDF created at {pdf_path}")


# --------------------------
# RUN ALL
# --------------------------
def run_for_all_jsons():
    for file in os.listdir(JSON_DIR):
        if file.endswith(".json"):
            process_json_to_pdf(os.path.join(JSON_DIR, file))

if __name__ == "__main__":
    run_for_all_jsons()
    end_time = time.perf_counter()
    print(f"\nTotal processing time: {end_time - start_time:.2f} seconds")
