"""Post-process generated schema docs: inject header, custom styles,
and separate ontology mapping references from description text."""

import re
import sys

# ---------------------------------------------------------------------------
# Ontology term linking
# ---------------------------------------------------------------------------

# Base URLs for known ontology prefixes.  The fragment (anchor) is the term
# code, e.g. "E21" for crm or "label" for rdfs.
ONTOLOGY_URLS = {
    'crm':     'https://cidoc-crm.org/html/cidoc_crm_v7.1.3.html',
    'lrm':     'https://cidoc-crm.org/extensions/lrmoo/html/LRMoo_v0.9.6.html',
    'rdf':     'https://www.w3.org/1999/02/22-rdf-syntax-ns',
    'rdfs':    'https://www.w3.org/2000/01/rdf-schema',
    'owl':     'https://www.w3.org/2002/07/owl',
    'dcterms': 'https://www.dublincore.org/specifications/dublin-core/dcmi-terms',
}

# Regex matching a prefixed ontology term, e.g. crm:E21, lrm:F2, rdfs:label
_ONT_TERM_RE = re.compile(
    r'\b(crm|lrm|rdf|rdfs|owl|dcterms|reo):([A-Za-z]\w*)'
)


def _ont_url(prefix, code):
    base = ONTOLOGY_URLS.get(prefix)
    if not base:
        return None
    return f'{base}#{code}'


def _linkify(text):
    """Replace prefixed ontology terms with <a> links."""
    def _replace(m):
        prefix, code = m.group(1), m.group(2)
        url = _ont_url(prefix, code)
        if url:
            return (f'<a href="{url}" target="_blank" '
                    f'rel="noopener">{m.group(0)}</a>')
        return m.group(0)
    return _ONT_TERM_RE.sub(_replace, text)


# ---------------------------------------------------------------------------
# Structured [ontology: ...] marker extraction
# ---------------------------------------------------------------------------

# Matches the structured marker injected by postprocess.js:
#   [ontology: crm:E21 Person]
_MARKER_RE = re.compile(r'\s*\[ontology:\s*(.+?)\]')

# Pre-compiled regex: <span class="description"><p>CONTENT</p>
_DESC_RE = re.compile(
    r'(<span class="description"><p>)(.*?)(</p>)',
    re.DOTALL,
)


def _process_descriptions(html):
    """Extract [ontology: ...] markers from descriptions and render them
    as styled, linked sections."""

    def _replace(m):
        open_tag, content, close_tag = m.group(1), m.group(2), m.group(3)
        marker = _MARKER_RE.search(content)
        if not marker:
            return m.group(0)
        regular = _MARKER_RE.sub('', content).strip()
        mapping_html = _linkify(marker.group(1))
        if regular:
            return (f'{open_tag}{regular}{close_tag}\n'
                    f'<div class="rdf-mapping">{mapping_html}</div>')
        # Entire description is just the marker – drop the empty <p>
        return (f'<span class="description">\n'
                f'<div class="rdf-mapping">{mapping_html}</div>')

    return _DESC_RE.sub(_replace, html)


# ---------------------------------------------------------------------------
# Main post-processing
# ---------------------------------------------------------------------------

def postprocess(filepath):
    with open(filepath, "r") as f:
        html = f.read()

    # Replace title
    html = html.replace("<title>Schema Docs</title>", "<title>Roll Edition Format</title>")

    # Inject custom styles and viewport meta before </head>
    custom = """
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body {
        max-width: 960px;
        margin: 0 auto;
        padding: 2rem 1.5rem;
        background: #fafafa;
      }
      .site-header {
        border-bottom: 1px solid #e0e0e0;
        padding-bottom: 1.25rem;
        margin-bottom: 2rem;
      }
      .site-header h1 {
        font-family: "Overpass", sans-serif;
        font-weight: 800;
        font-size: 1.75rem;
        margin: 0 0 0.25rem;
        color: #1a1a1a;
      }
      .site-header p {
        margin: 0;
        color: #555;
        font-size: 0.95rem;
      }
      .site-header a {
        color: #0366d6;
        text-decoration: none;
      }
      .site-header a:hover {
        text-decoration: underline;
      }
      .card {
        border-radius: 6px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .card-header {
        background: #fff;
      }
      .btn.btn-link.property-name-button {
        color: #1a1a1a;
        text-decoration: none;
        font-weight: 600;
      }
      .badge-dark {
        background-color: #495057;
      }
      .badge-warning {
        background-color: #e8a735;
        color: #fff;
      }
      footer {
        margin-top: 3rem;
        padding-top: 1rem;
        border-top: 1px solid #e0e0e0;
      }
      .generated-by-footer {
        font-size: 0.8rem;
        color: #999;
      }
      .root-intro {
        margin-bottom: 1.5rem;
      }
      .root-intro p {
        font-size: 1rem;
        color: #333;
        line-height: 1.6;
      }
      .array-items-label {
        font-size: 0.85rem;
        color: #666;
        margin: 0.5rem 0 0.25rem;
      }
      .rdf-mapping {
        margin: 0.35rem 0 0.6rem;
        padding: 0.2rem 0 0.2rem 0.6rem;
        font-size: 0.82em;
        color: #607080;
        border-left: 2px solid #b0c4d8;
      }
      .rdf-mapping a {
        color: #3a6fa0;
        text-decoration: none;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 0.95em;
      }
      .rdf-mapping a:hover {
        text-decoration: underline;
      }
    </style>
"""
    html = html.replace("</head>", custom + "</head>")

    # Inject header after <body ...> (skip if already present)
    if 'class="site-header"' not in html:
        header = """
    <header class="site-header">
      <h1>Roll Edition Format</h1>
      <p>
        Schema documentation for the
        <a href="https://github.com/pfefferniels/linked-rolls">linked-rolls</a>
        piano roll edition format.
      </p>
    </header>
"""
        html = re.sub(
            r'(<body[^>]*>)',
            r'\1' + header,
            html,
        )

    # Replace the generic root object rendering with a descriptive introduction
    html = re.sub(
        r'<div class="breadcrumbs"></div>'
        r'<span class="badge badge-dark value-type">Type: object</span><br/>\s*'
        r'<span class="description"><p>[^<]*</p>\s*</span>',
        '<div class="root-intro">'
        '<p>The root element of this format is an <strong>Edition</strong>, '
        'describing a specific digital edition of a piano roll '
        '(cf. lrm:F2 Expression). '
        'It consists of the following properties:</p>'
        '</div>',
        html,
        count=1,
    )

    # Downsize "Each item of this array must be:" from h4 to a smaller label
    html = html.replace(
        '<h4>Each item of this array must be:</h4>',
        '<p class="array-items-label"><em>Each item of this array must be:</em></p>',
    )

    # Separate ontology mappings from descriptions into styled sections
    html = _process_descriptions(html)

    with open(filepath, "w") as f:
        f.write(html)

if __name__ == "__main__":
    postprocess(sys.argv[1])
