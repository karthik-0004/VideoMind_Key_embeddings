import React, { useState } from 'react';

/**
 * Lightweight Markdown renderer for AI chat messages.
 * Handles: code blocks, inline code, bold, italic, headers, lists, blockquotes.
 */

const CopyButton = ({ text }) => {
    const [copied, setCopied] = useState(false);
    return (
        <button
            className="md-copy-btn"
            onClick={() => {
                navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                });
            }}
        >
            {copied ? '✓ Copied' : 'Copy'}
        </button>
    );
};

const renderInline = (text) => {
    const parts = [];
    // Process: bold(**), italic(*), inline code(`)
    const regex = /(`([^`]+)`)|(\*\*(.+?)\*\*)|(\*(.+?)\*)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        if (match[1]) {
            // inline code
            parts.push(<code key={match.index} className="md-inline-code">{match[2]}</code>);
        } else if (match[3]) {
            // bold
            parts.push(<strong key={match.index}>{match[4]}</strong>);
        } else if (match[5]) {
            // italic
            parts.push(<em key={match.index}>{match[6]}</em>);
        }
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
};

export const MarkdownRenderer = ({ content }) => {
    if (!content) return null;

    const lines = content.split('\n');
    const elements = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Code blocks ```
        if (line.trimStart().startsWith('```')) {
            const lang = line.trimStart().slice(3).trim();
            const codeLines = [];
            i++;
            while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            i++; // skip closing ```
            const code = codeLines.join('\n');
            elements.push(
                <div key={elements.length} className="md-code-block">
                    <div className="md-code-header">
                        <span className="md-code-lang">{lang || 'code'}</span>
                        <CopyButton text={code} />
                    </div>
                    <pre className="md-code-pre"><code>{code}</code></pre>
                </div>
            );
            continue;
        }

        // Headers
        if (line.startsWith('### ')) {
            elements.push(<h4 key={elements.length} className="md-h3">{renderInline(line.slice(4))}</h4>);
            i++;
            continue;
        }
        if (line.startsWith('## ')) {
            elements.push(<h3 key={elements.length} className="md-h2">{renderInline(line.slice(3))}</h3>);
            i++;
            continue;
        }
        if (line.startsWith('# ')) {
            elements.push(<h2 key={elements.length} className="md-h1">{renderInline(line.slice(2))}</h2>);
            i++;
            continue;
        }

        // Blockquote
        if (line.startsWith('> ')) {
            const quoteLines = [line.slice(2)];
            i++;
            while (i < lines.length && lines[i].startsWith('> ')) {
                quoteLines.push(lines[i].slice(2));
                i++;
            }
            elements.push(
                <blockquote key={elements.length} className="md-blockquote">
                    {quoteLines.map((ql, qi) => <p key={qi}>{renderInline(ql)}</p>)}
                </blockquote>
            );
            continue;
        }

        // Unordered list
        if (/^[\-\*]\s/.test(line)) {
            const items = [line.replace(/^[\-\*]\s/, '')];
            i++;
            while (i < lines.length && /^[\-\*]\s/.test(lines[i])) {
                items.push(lines[i].replace(/^[\-\*]\s/, ''));
                i++;
            }
            elements.push(
                <ul key={elements.length} className="md-ul">
                    {items.map((item, li) => <li key={li}>{renderInline(item)}</li>)}
                </ul>
            );
            continue;
        }

        // Ordered list
        if (/^\d+\.\s/.test(line)) {
            const items = [line.replace(/^\d+\.\s/, '')];
            i++;
            while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
                items.push(lines[i].replace(/^\d+\.\s/, ''));
                i++;
            }
            elements.push(
                <ol key={elements.length} className="md-ol">
                    {items.map((item, li) => <li key={li}>{renderInline(item)}</li>)}
                </ol>
            );
            continue;
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
            elements.push(<hr key={elements.length} className="md-hr" />);
            i++;
            continue;
        }

        // Empty line
        if (line.trim() === '') {
            i++;
            continue;
        }

        // Regular paragraph
        elements.push(<p key={elements.length} className="md-p">{renderInline(line)}</p>);
        i++;
    }

    return <div className="md-render">{elements}</div>;
};
