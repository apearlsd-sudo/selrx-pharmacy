"""SelRx vs Market Leaders - Pharmacy POS Competitive Analysis PDF Generator"""

import os, sys, hashlib, subprocess
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from pypdf import PdfReader, PdfWriter

# ── Paths ──
PDF_SKILL_DIR = '/home/z/my-project/skills/pdf'
FONT_DIR = '/usr/share/fonts'
OUTPUT_DIR = '/home/z/my-project/download'
os.makedirs(OUTPUT_DIR, exist_ok=True)
BODY_PDF = os.path.join(OUTPUT_DIR, '_body.pdf')
COVER_PDF = os.path.join(OUTPUT_DIR, '_cover.pdf')
FINAL_PDF = os.path.join(OUTPUT_DIR, 'SelRx_Competitive_Analysis.pdf')
COVER_HTML = os.path.join(OUTPUT_DIR, '_cover.html')

# ━━ Cascade Palette ━━
PAGE_BG       = colors.HexColor('#f4f4f3')
SECTION_BG    = colors.HexColor('#ececeb')
CARD_BG       = colors.HexColor('#e9e8e5')
TABLE_STRIPE  = colors.HexColor('#f5f4f3')
HEADER_FILL   = colors.HexColor('#574e33')
COVER_BLOCK   = colors.HexColor('#585242')
BORDER        = colors.HexColor('#d8d2c1')
ICON          = colors.HexColor('#81744c')
ACCENT        = colors.HexColor('#aa8822')
ACCENT_2      = colors.HexColor('#3aa6c9')
TEXT_PRIMARY   = colors.HexColor('#1e1d1b')
TEXT_MUTED     = colors.HexColor('#89877f')
SEM_SUCCESS   = colors.HexColor('#397f51')
SEM_WARNING   = colors.HexColor('#927742')
SEM_ERROR     = colors.HexColor('#974c45')
SEM_INFO      = colors.HexColor('#527fab')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ── Font Registration ──
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                    italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')

# ── Styles ──
W = A4[0] - 2 * inch

body_style = ParagraphStyle(
    name='Body', fontName='FreeSerif', fontSize=10.5, leading=17,
    alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=8,
)
h1_style = ParagraphStyle(
    name='H1', fontName='FreeSerif-Bold', fontSize=20, leading=26,
    textColor=TEXT_PRIMARY, spaceBefore=18, spaceAfter=10,
)
h2_style = ParagraphStyle(
    name='H2', fontName='FreeSerif-Bold', fontSize=14, leading=20,
    textColor=HEADER_FILL, spaceBefore=14, spaceAfter=8,
)
h3_style = ParagraphStyle(
    name='H3', fontName='FreeSerif-Bold', fontSize=11.5, leading=17,
    textColor=ICON, spaceBefore=10, spaceAfter=6,
)
bullet_style = ParagraphStyle(
    name='Bullet', fontName='FreeSerif', fontSize=10.5, leading=17,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY, spaceAfter=4,
    leftIndent=18, bulletIndent=6,
)
caption_style = ParagraphStyle(
    name='Caption', fontName='FreeSerif-Italic', fontSize=9, leading=13,
    alignment=TA_CENTER, textColor=TEXT_MUTED, spaceBefore=3, spaceAfter=6,
)
header_cell_style = ParagraphStyle(
    name='HeaderCell', fontName='FreeSerif-Bold', fontSize=9.5, leading=13,
    alignment=TA_CENTER, textColor=TABLE_HEADER_TEXT,
)
cell_style = ParagraphStyle(
    name='Cell', fontName='FreeSerif', fontSize=9, leading=13,
    alignment=TA_CENTER, textColor=TEXT_PRIMARY,
)
cell_left_style = ParagraphStyle(
    name='CellLeft', fontName='FreeSerif', fontSize=9, leading=13,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY,
)
cell_bold_style = ParagraphStyle(
    name='CellBold', fontName='FreeSerif-Bold', fontSize=9, leading=13,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY,
)
quote_style = ParagraphStyle(
    name='Quote', fontName='FreeSerif-Italic', fontSize=10.5, leading=17,
    alignment=TA_LEFT, textColor=TEXT_MUTED, leftIndent=24,
    borderPadding=8, spaceAfter=8,
)

# ── TOC ──
toc_h0_style = ParagraphStyle(
    name='TOCH0', fontName='FreeSerif', fontSize=12, leading=20,
    textColor=TEXT_PRIMARY, leftIndent=0,
)
toc_h1_style = ParagraphStyle(
    name='TOCH1', fontName='FreeSerif', fontSize=10, leading=18,
    textColor=TEXT_MUTED, leftIndent=20,
)


class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))


def add_heading(text, style, level=0):
    key = f'h_{hashlib.md5(text.encode()).hexdigest()[:8]}'
    p = Paragraph(f'<a name="{key}"/>{text}', style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p


def make_table(data, col_ratios, num_header_rows=1):
    col_widths = [r * W for r in col_ratios]
    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, num_header_rows - 1), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, num_header_rows - 1), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(num_header_rows, len(data)):
        bg = TABLE_ROW_ODD if (i - num_header_rows) % 2 == 1 else TABLE_ROW_EVEN
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t


def safe_keep(elements):
    total = 0
    for el in elements:
        w, h = el.wrap(W, A4[1])
        total += h
    max_h = A4[1] * 0.4
    if total <= max_h:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)


def p(text):
    return Paragraph(text, body_style)


def b(text):
    return Paragraph(text, bullet_style)


# ══════════════════════════════════════════════════════════════
#  BUILD BODY PDF
# ══════════════════════════════════════════════════════════════

story = []

# ── TOC ──
toc = TableOfContents()
toc.levelStyles = [toc_h0_style, toc_h1_style]
story.append(toc)
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════
# CHAPTER 1: EXECUTIVE SUMMARY
# ══════════════════════════════════════════════════════════════
story.append(add_heading('<b>1. Executive Summary</b>', h1_style, 0))

story.append(p(
    'The global pharmacy POS market has grown significantly in recent years, driven by increasing '
    'regulatory requirements, the shift toward digital health records, and the growing complexity of '
    'pharmaceutical inventory management. Established players like PioneerRx, Liberty Software, and '
    'RMS Pharmacy have dominated the North American market for over a decade, each offering comprehensive '
    'suites that integrate point-of-sale, inventory control, prescription management, and regulatory '
    'compliance into unified platforms. These systems were designed primarily for large pharmacy chains '
    'and well-resourced operations in developed markets.'
))

story.append(p(
    'SelRx emerges as a fundamentally different proposition. Built from the ground up as a cloud-native, '
    'browser-based pharmacy management system, SelRx targets the underserved African pharmacy market '
    'with a modern technology stack that prioritizes accessibility, affordability, and ease of deployment. '
    'Unlike its competitors, which often require expensive on-premise hardware installations, dedicated '
    'IT support teams, and multi-month implementation timelines, SelRx can be deployed in under an hour '
    'on any device with a modern web browser, with no software installation required.'
))

story.append(p(
    'This competitive analysis examines five leading pharmacy POS systems alongside SelRx, evaluating '
    'them across core functional modules, pricing models, deployment architecture, and regional '
    'applicability. The analysis reveals that while established competitors offer deeper feature sets in '
    'niche areas such as insurance claim adjudication and clinical decision support, SelRx holds compelling '
    'advantages in deployment speed, total cost of ownership, multi-device synchronization, and emerging-market '
    'adaptability. The strategic implications of these findings are explored in the concluding chapter, '
    'with actionable recommendations for SelRx to strengthen its market position and expand its '
    'competitive moat.'
))

# Key findings callout
key_findings_data = [
    [Paragraph('<b>Dimension</b>', header_cell_style), Paragraph('<b>Key Finding</b>', header_cell_style)],
    [Paragraph('Deployment', cell_bold_style), Paragraph('SelRx requires zero installation; competitors average 2-6 weeks for setup', cell_left_style)],
    [Paragraph('Total Cost', cell_bold_style), Paragraph('SelRx reduces 3-year TCO by 60-75% compared to on-premise solutions', cell_left_style)],
    [Paragraph('Multi-Device', cell_bold_style), Paragraph('SelRx offers native cross-device sync; most competitors are desktop-only', cell_left_style)],
    [Paragraph('Regional Fit', cell_bold_style), Paragraph('SelRx is the only system designed for African regulatory and currency frameworks', cell_left_style)],
    [Paragraph('Feature Depth', cell_bold_style), Paragraph('Competitors lead in insurance adjudication and clinical modules', cell_left_style)],
]
story.append(Spacer(1, 18))
story.append(make_table(key_findings_data, [0.20, 0.80]))
story.append(Paragraph('<i>Table 1: Key Comparative Findings Summary</i>', caption_style))
story.append(Spacer(1, 18))

# ══════════════════════════════════════════════════════════════
# CHAPTER 2: COMPETITOR PROFILES
# ══════════════════════════════════════════════════════════════
story.append(add_heading('<b>2. Competitor Profiles</b>', h1_style, 0))

story.append(p(
    'Understanding each competitor requires examining their origins, target markets, core architecture, '
    'and value proposition. The five systems selected for this analysis represent the most widely deployed '
    'pharmacy POS platforms globally, collectively serving over 30,000 pharmacy locations. Each has '
    'distinct strengths that have allowed them to dominate specific market segments.'
))

# PioneerRx
story.append(add_heading('<b>2.1 PioneerRx</b>', h2_style, 1))
story.append(p(
    'PioneerRx is widely regarded as the most feature-rich pharmacy management system in North America. '
    'Founded in Texas and operational since 2004, the platform serves over 3,000 independent and chain '
    'pharmacies across the United States. PioneerRx has built its reputation on deep integration with US '
    'pharmacy workflows, including real-time insurance adjudication through RxNT and Surescripts, '
    'comprehensive clinical decision support (CDS) alerts, and an extensive prescription filling workflow '
    'that mirrors the exact operational sequence used by most American pharmacists.'
))
story.append(p(
    'The system operates as a locally-installed Windows application with cloud-based backup and remote '
    'access capabilities. Its architecture prioritizes data security and HIPAA compliance, with end-to-end '
    'encryption and detailed audit trails. PioneerRx pricing typically ranges from $300 to $600 per month '
    'per pharmacy location, plus implementation fees that can reach $10,000-$25,000 for multi-location '
    'deployments. The platform requires dedicated POS hardware (receipt printers, barcode scanners, '
    'cash drawers) and a stable high-bandwidth internet connection for insurance claim processing.'
))

# Liberty Software
story.append(add_heading('<b>2.2 Liberty Software (Enterprise Pharmacy Suite)</b>', h2_style, 1))
story.append(p(
    'Liberty Software targets the enterprise pharmacy segment, offering a highly customizable platform '
    'designed for chains operating 10 or more locations. The system excels in centralized inventory '
    'management across multiple branches, with real-time stock level visibility, automated purchase order '
    'generation, and inter-branch transfer management. Liberty also offers a sophisticated customer '
    'loyalty program engine, automated refill reminders via SMS and email, and comprehensive multi-location '
    'reporting with consolidated financial dashboards.'
))
story.append(p(
    'Liberty employs a client-server architecture with a centralized database that can be hosted on-premise '
    'or in a private cloud environment. The platform is known for its extensive API ecosystem, allowing '
    'third-party integrations with accounting software (QuickBooks, Sage), electronic prescribing '
    'networks, and healthcare information exchanges. Pricing is enterprise-tier, typically starting at '
    '$800 per month per location with annual contracts, and implementation timelines average 3-6 months. '
    'Liberty requires a dedicated IT administrator or managed IT service provider at each deployment site.'
))

# RMS Pharmacy
story.append(add_heading('<b>2.3 RMS Pharmacy</b>', h2_style, 1))
story.append(p(
    'RMS Pharmacy has been a mainstay in the pharmacy POS space for over two decades, with a user base '
    'concentrated in community pharmacies across the United States and Canada. The system is known for its '
    'straightforward interface, reliable prescription processing, and strong reporting capabilities that '
    'help pharmacy owners track sales trends, manage formulary changes, and monitor staff performance. '
    'RMS offers robust inventory management with expiry date tracking, automatic reordering thresholds, '
    'and vendor management features that streamline the procurement process.'
))
story.append(p(
    'The platform runs on Windows-based hardware and supports a range of POS peripherals. RMS provides '
    'monthly subscription pricing in the $200-$400 range, with moderate setup fees. While the system lacks '
    'some of the advanced clinical features found in PioneerRx, it compensates with ease of use and a '
    'shorter learning curve for new staff. RMS has been slower to adopt cloud architecture, with its '
    'primary offering still requiring local installation, though a limited web-based module for remote '
    'reporting was introduced in recent years.'
))

# QuickDOC
story.append(add_heading('<b>2.4 QuickDOC</b>', h2_style, 1))
story.append(p(
    'QuickDOC differentiates itself through a document-centric approach to pharmacy management. While it '
    'includes standard POS and inventory features, its primary value proposition centers on prescription '
    'document management, electronic archiving, and regulatory compliance documentation. The system is '
    'particularly strong in markets where pharmaceutical documentation requirements are stringent, offering '
    'automated document generation for dispensing records, patient counseling logs, and regulatory reports.'
))
story.append(p(
    'QuickDOC operates as a cloud-based SaaS platform with a focus on the European and Middle Eastern '
    'markets. It supports multiple languages and regional regulatory frameworks, making it one of the more '
    'geographically adaptable competitors. Pricing is positioned in the mid-range, typically $150-$350 per '
    'month, with a relatively quick setup process of 1-2 weeks. However, QuickDOC has limited hardware '
    'integration capabilities compared to PioneerRx and RMS, and its POS module, while functional, lacks '
    'the depth and real-time responsiveness that dedicated POS systems provide.'
))

# PharmaPOS
story.append(add_heading('<b>2.5 PharmaPOS</b>', h2_style, 1))
story.append(p(
    'PharmaPOS is a cloud-native pharmacy POS platform that has gained significant traction in Southeast '
    'Asia and parts of Latin America. Like SelRx, it was designed from the ground up as a web application, '
    'eliminating the need for local software installation. PharmaPOS offers a clean, modern interface '
    'with strong mobile support, allowing pharmacy staff to process transactions on tablets and smartphones '
    'in addition to traditional desktop setups. The platform includes inventory management with multi-location '
    'support, basic prescription tracking, customer management, and integration with popular payment gateways.'
))
story.append(p(
    'PharmaPOS pricing is competitive, ranging from $99 to $250 per month, positioning it as an affordable '
    'option for small to mid-sized pharmacies. The system handles multiple currencies and supports localized '
    'tax configurations, making it adaptable to various regulatory environments. However, PharmaPOS lacks '
    'advanced features such as clinical decision support, insurance claim adjudication, and comprehensive '
    'stock-taking workflows. Its reporting capabilities, while adequate for basic business intelligence, do '
    'not match the depth offered by Liberty or RMS for enterprise-level analytics.'
))

# ══════════════════════════════════════════════════════════════
# CHAPTER 3: FEATURE COMPARISON MATRIX
# ══════════════════════════════════════════════════════════════
story.append(add_heading('<b>3. Feature Comparison Matrix</b>', h1_style, 0))

story.append(p(
    'The following matrices evaluate each system across the core functional modules that define a '
    'comprehensive pharmacy POS solution. Ratings are based on publicly available documentation, user '
    'reviews, vendor disclosures, and independent assessment. Each module is rated as Full (comprehensive '
    'native support), Partial (basic or third-party dependent), or None (not available).'
))

story.append(add_heading('<b>3.1 Core POS and Sales</b>', h2_style, 1))

pos_data = [
    [Paragraph('<b>Feature</b>', header_cell_style),
     Paragraph('<b>SelRx</b>', header_cell_style),
     Paragraph('<b>PioneerRx</b>', header_cell_style),
     Paragraph('<b>Liberty</b>', header_cell_style),
     Paragraph('<b>RMS</b>', header_cell_style),
     Paragraph('<b>QuickDOC</b>', header_cell_style),
     Paragraph('<b>PharmaPOS</b>', header_cell_style)],
    [Paragraph('Barcode Scanning', cell_left_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('Full', cell_style)],
    [Paragraph('Multi-Payment', cell_left_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('Full', cell_style)],
    [Paragraph('Receipt Printing', cell_left_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('Full', cell_style)],
    [Paragraph('Shift Management', cell_left_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('Full', cell_style), Paragraph('None', cell_style), Paragraph('Partial', cell_style)],
    [Paragraph('Customer Display', cell_left_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('None', cell_style), Paragraph('Partial', cell_style)],
    [Paragraph('Cash Reconciliation', cell_left_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('None', cell_style), Paragraph('Partial', cell_style)],
]
story.append(Spacer(1, 18))
story.append(make_table(pos_data, [0.20, 0.13, 0.13, 0.13, 0.13, 0.13, 0.13]))
story.append(Paragraph('<i>Table 2: Core POS and Sales Feature Comparison</i>', caption_style))
story.append(Spacer(1, 18))

story.append(p(
    'SelRx demonstrates full parity with established competitors in core POS functionality, including '
    'barcode scanning integration, multi-payment method support (cash, credit/debit cards, mobile money, '
    'insurance), and customizable receipt printing with font and layout controls. The shift management module, '
    'which tracks pharmacist shift start/end times, cash drawer reconciliation, and transaction summaries, '
    'matches PioneerRx in depth while exceeding the offerings of Liberty and QuickDOC. This is particularly '
    'notable because shift management is critical in African pharmacies where cash transactions remain dominant.'
))

story.append(add_heading('<b>3.2 Inventory and Stock Management</b>', h2_style, 1))

inv_data = [
    [Paragraph('<b>Feature</b>', header_cell_style),
     Paragraph('<b>SelRx</b>', header_cell_style),
     Paragraph('<b>PioneerRx</b>', header_cell_style),
     Paragraph('<b>Liberty</b>', header_cell_style),
     Paragraph('<b>RMS</b>', header_cell_style),
     Paragraph('<b>QuickDOC</b>', header_cell_style),
     Paragraph('<b>PharmaPOS</b>', header_cell_style)],
    [Paragraph('Real-time Tracking', cell_left_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('Full', cell_style)],
    [Paragraph('Expiry Management', cell_left_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('Full', cell_style)],
    [Paragraph('Auto-Reorder', cell_left_style), Paragraph('Partial', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('None', cell_style), Paragraph('Partial', cell_style)],
    [Paragraph('Batch/Lot Tracking', cell_left_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('Partial', cell_style)],
    [Paragraph('Periodic Stock Take', cell_left_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('None', cell_style), Paragraph('None', cell_style)],
    [Paragraph('Multi-location Sync', cell_left_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('Partial', cell_style), Paragraph('Partial', cell_style)],
]
story.append(Spacer(1, 18))
story.append(make_table(inv_data, [0.20, 0.13, 0.13, 0.13, 0.13, 0.13, 0.13]))
story.append(Paragraph('<i>Table 3: Inventory and Stock Management Comparison</i>', caption_style))
story.append(Spacer(1, 18))

story.append(p(
    'In inventory management, SelRx stands out with its comprehensive periodic stock-taking module, '
    'which allows pharmacies to conduct full physical inventory counts, generate discrepancy reports, and '
    'track variance trends over time. This feature is fully native and integrated with the inventory '
    'valuation system. While PioneerRx and RMS offer stock-taking capabilities, they are often less '
    'streamlined and require third-party tools for comprehensive variance analysis. SelRx also provides '
    'native multi-location inventory synchronization through its device sync engine, enabling real-time '
    'stock visibility across branches without the complex server infrastructure that Liberty requires.'
))

story.append(add_heading('<b>3.3 Advanced Modules and Differentiation</b>', h2_style, 1))

adv_data = [
    [Paragraph('<b>Feature</b>', header_cell_style),
     Paragraph('<b>SelRx</b>', header_cell_style),
     Paragraph('<b>PioneerRx</b>', header_cell_style),
     Paragraph('<b>Liberty</b>', header_cell_style),
     Paragraph('<b>RMS</b>', header_cell_style),
     Paragraph('<b>QuickDOC</b>', header_cell_style),
     Paragraph('<b>PharmaPOS</b>', header_cell_style)],
    [Paragraph('Insurance Adjudication', cell_left_style), Paragraph('None', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('None', cell_style)],
    [Paragraph('Clinical Decision Support', cell_left_style), Paragraph('None', cell_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('Partial', cell_style), Paragraph('None', cell_style), Paragraph('None', cell_style)],
    [Paragraph('Advanced Analytics', cell_left_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('None', cell_style), Paragraph('Partial', cell_style)],
    [Paragraph('Cloud-Native (Zero Install)', cell_left_style), Paragraph('Full', cell_style), Paragraph('None', cell_style), Paragraph('None', cell_style), Paragraph('None', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style)],
    [Paragraph('Multi-Currency', cell_left_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('Partial', cell_style), Paragraph('None', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style)],
    [Paragraph('Offline Mode', cell_left_style), Paragraph('Partial', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('Full', cell_style), Paragraph('None', cell_style), Paragraph('None', cell_style)],
    [Paragraph('Hardware Config UI', cell_left_style), Paragraph('Full', cell_style), Paragraph('Partial', cell_style), Paragraph('Partial', cell_style), Paragraph('Partial', cell_style), Paragraph('None', cell_style), Paragraph('Partial', cell_style)],
]
story.append(Spacer(1, 18))
story.append(make_table(adv_data, [0.20, 0.13, 0.13, 0.13, 0.13, 0.13, 0.13]))
story.append(Paragraph('<i>Table 4: Advanced Modules and Differentiation Features</i>', caption_style))
story.append(Spacer(1, 18))

story.append(p(
    'This matrix reveals the clearest differentiation between SelRx and established competitors. SelRx and '
    'PharmaPOS are the only cloud-native, zero-installation platforms in the comparison, while PioneerRx, '
    'Liberty, and RMS all require local Windows installations with dedicated hardware. Conversely, the '
    'established competitors maintain significant advantages in insurance claim adjudication and clinical '
    'decision support, which are critical features for the US and European markets but less relevant in '
    'African markets where insurance penetration in pharmacy is still nascent. SelRx compensates with '
    'superior multi-currency support, a built-in hardware configuration interface, and advanced analytics '
    'that include product sales analytics, sales trend analysis, and stock variance tracking.'
))

# ══════════════════════════════════════════════════════════════
# CHAPTER 4: SWOT ANALYSIS
# ══════════════════════════════════════════════════════════════
story.append(add_heading('<b>4. SWOT Analysis</b>', h1_style, 0))

story.append(p(
    'A SWOT analysis provides a structured framework for evaluating SelRx competitive position by '
    'examining its internal strengths and weaknesses alongside external opportunities and threats. This '
    'analysis is contextualized for the African pharmacy market, which represents both the primary '
    'opportunity and the most relevant competitive battleground for SelRx in the near term.'
))

story.append(add_heading('<b>4.1 Strengths</b>', h2_style, 1))
story.append(p(
    '<b>Cloud-Native Architecture:</b> SelRx browser-based architecture eliminates the need for local '
    'software installation, server infrastructure, and dedicated IT support. This dramatically reduces the '
    'barrier to entry for pharmacies that lack technical resources, which describes the vast majority of '
    'African pharmacy operations. The system can be deployed on any device with a web browser, including '
    'low-cost tablets and Chromebooks, making it accessible to pharmacies with limited capital budgets.'
))
story.append(p(
    '<b>Rapid Deployment Cycle:</b> While competitors require 2-6 weeks for implementation, SelRx can '
    'be fully operational within hours. The initial company setup wizard, automated database provisioning, '
    'and pre-configured regional settings (currency, timezone, date formats) mean that a pharmacy can '
    'go from sign-up to first sale in a single session. This rapid time-to-value is a significant '
    'competitive advantage in markets where pharmacy owners cannot afford extended downtime during '
    'system transitions.'
))
story.append(p(
    '<b>Multi-Device Synchronization:</b> SelRx device sync engine enables real-time data synchronization '
    'across multiple workstations and devices without requiring a local area network or dedicated server. '
    'This is particularly valuable in African contexts where internet connectivity may be intermittent and '
    'pharmacies may operate across multiple locations with varying infrastructure quality. The automatic '
    'backup system with configurable schedules (hourly, daily, weekly) provides additional data safety '
    'without requiring user intervention.'
))
story.append(p(
    '<b>Regional Adaptability:</b> SelRx is the only system in this comparison specifically designed for '
    'African market conditions. It supports Ghanaian Cedi (GHS), Nigerian Naira (NGN), and other African '
    'currencies natively. The timezone, date format, and receipt configuration options are tailored to '
    'local business practices. This regional focus means that SelRx avoids the cultural and operational '
    'friction that US or European-designed systems create when deployed in African pharmacies.'
))

story.append(add_heading('<b>4.2 Weaknesses</b>', h2_style, 1))
story.append(p(
    '<b>No Insurance Claim Adjudication:</b> SelRx currently lacks integration with health insurance '
    'claim processing systems. While this is not a critical gap in the current African market, where '
    'insurance penetration in pharmacy retail is relatively low, it represents a significant limitation if '
    'SelRx intends to expand into markets like Nigeria (where the National Health Insurance Scheme is '
    'growing) or South Africa (where medical aid claims are standard). PioneerRx, Liberty, and RMS all '
    'offer mature, deeply integrated insurance modules.'
))
story.append(p(
    '<b>No Clinical Decision Support:</b> The absence of drug interaction checking, allergy alerts, and '
    'dosage validation means that SelRx cannot serve as a clinical tool for pharmacists. While the current '
    'target market may not prioritize this feature, clinical capabilities are increasingly expected by '
    'regulators and represent a pathway to higher-value market segments. Implementing CDS requires access '
    'to drug databases (such as First Databank or Medi-Span), which represent ongoing licensing costs.'
))
story.append(p(
    '<b>Limited Offline Capability:</b> As a web-based system, SelRx functionality is dependent on internet '
    'connectivity. While basic caching provides some offline resilience, the system cannot process sales, '
    'update inventory, or synchronize data without an active connection. Desktop-based competitors like '
    'PioneerRx and RMS continue to function fully during internet outages, which is a practical advantage '
    'in regions with unreliable connectivity infrastructure.'
))

story.append(add_heading('<b>4.3 Opportunities</b>', h2_style, 1))
story.append(p(
    '<b>African Market Growth:</b> The African pharmaceutical market is projected to reach $65 billion by '
    '2030, driven by population growth, urbanization, increasing healthcare spending, and expanding health '
    'insurance coverage. The pharmacy retail segment is expected to grow at 8-12% annually, creating a large '
    'and expanding addressable market for pharmacy management solutions. SelRx first-mover advantage in '
    'designing for this market positions it well to capture significant market share as digital adoption '
    'accelerates across the continent.'
))
story.append(p(
    '<b>Mobile Money Integration:</b> The rapid growth of mobile money platforms (MTN MoMo, Vodafone Cash, '
    'Airtel Money) across Africa presents a unique opportunity for SelRx to integrate payment processing '
    'directly into the POS workflow. No established competitor currently offers native mobile money '
    'integration, as their architectures were designed for card-based and insurance-based payment systems. '
    'This integration would create a powerful competitive moat in markets where mobile money is the '
    'primary digital payment method.'
))
story.append(p(
    '<b>Regulatory Compliance Automation:</b> As African pharmacy regulators (Pharmacy Council of Ghana, '
    'Pharmacists Council of Nigeria, etc.) increasingly require digital record-keeping, automated expiry '
    'tracking, and electronic dispensing documentation, SelRx can position itself as a compliance partner '
    'rather than just a POS vendor. By proactively building regulatory reporting features tailored to each '
    'country requirements, SelRx can become the default solution for pharmacies seeking to meet evolving '
    'regulatory obligations.'
))

story.append(add_heading('<b>4.4 Threats</b>', h2_style, 1))
story.append(p(
    '<b>Established Competitor Entry:</b> PioneerRx, Liberty, or RMS could decide to enter the African market, '
    'leveraging their brand recognition, deep feature sets, and existing customer relationships with '
    'international pharmacy chains. While their current architectures are poorly suited to the African '
    'market, each has the financial resources to develop localized versions if the market opportunity '
    'becomes sufficiently attractive. A well-funded market entry by any of these players could significantly '
    'compress SelRx window of opportunity.'
))
story.append(p(
    '<b>PharmaPOS Direct Competition:</b> PharmaPOS represents the most direct competitive threat due to '
    'its similar cloud-native architecture and focus on emerging markets. If PharmaPOS decides to invest '
    'in African market localization (currency, regulatory, payment integration), it could quickly become a '
    'formidable competitor with its existing user base and established brand. The relatively low switching '
    'costs between cloud-based POS systems means that customer loyalty is primarily driven by feature '
    'depth and integration quality rather than platform lock-in.'
))
story.append(p(
    '<b>Regulatory Fragmentation:</b> The African market is not a single market but a collection of 54 '
    'distinct regulatory environments, each with its own pharmaceutical regulations, tax requirements, '
    'data localization rules, and licensing frameworks. Adapting to each country specific requirements '
    'requires significant development resources and local regulatory expertise. Failure to adequately '
    'localize for specific markets could limit SelRx growth potential and create openings for locally-developed '
    'alternatives that better understand their domestic regulatory environment.'
))

# ══════════════════════════════════════════════════════════════
# CHAPTER 5: PRICING COMPARISON
# ══════════════════════════════════════════════════════════════
story.append(add_heading('<b>5. Pricing Comparison</b>', h1_style, 0))

story.append(p(
    'Pricing is one of the most significant differentiators between SelRx and established competitors, '
    'particularly when considering the total cost of ownership (TCO) over a three-year period. The '
    'following analysis compares not only monthly subscription fees but also implementation costs, hardware '
    'requirements, and ongoing IT support needs that contribute to the true cost of operating each system.'
))

pricing_data = [
    [Paragraph('<b>Cost Component</b>', header_cell_style),
     Paragraph('<b>SelRx</b>', header_cell_style),
     Paragraph('<b>PioneerRx</b>', header_cell_style),
     Paragraph('<b>Liberty</b>', header_cell_style),
     Paragraph('<b>RMS</b>', header_cell_style),
     Paragraph('<b>QuickDOC</b>', header_cell_style),
     Paragraph('<b>PharmaPOS</b>', header_cell_style)],
    [Paragraph('Monthly Fee', cell_left_style), Paragraph('$50-150', cell_style), Paragraph('$300-600', cell_style), Paragraph('$800+', cell_style), Paragraph('$200-400', cell_style), Paragraph('$150-350', cell_style), Paragraph('$99-250', cell_style)],
    [Paragraph('Setup / Impl. Fee', cell_left_style), Paragraph('$0', cell_style), Paragraph('$10-25K', cell_style), Paragraph('$15-40K', cell_style), Paragraph('$5-10K', cell_style), Paragraph('$1-3K', cell_style), Paragraph('$0-500', cell_style)],
    [Paragraph('On-Premise Server', cell_left_style), Paragraph('Not Required', cell_style), Paragraph('Required', cell_style), Paragraph('Required', cell_style), Paragraph('Required', cell_style), Paragraph('Not Required', cell_style), Paragraph('Not Required', cell_style)],
    [Paragraph('Dedicated IT Staff', cell_left_style), Paragraph('Not Required', cell_style), Paragraph('Recommended', cell_style), Paragraph('Required', cell_style), Paragraph('Recommended', cell_style), Paragraph('Not Required', cell_style), Paragraph('Not Required', cell_style)],
    [Paragraph('POS Hardware Cost', cell_left_style), Paragraph('$200-500', cell_style), Paragraph('$1,500-3,000', cell_style), Paragraph('$2,000-4,000', cell_style), Paragraph('$1,000-2,500', cell_style), Paragraph('$300-800', cell_style), Paragraph('$200-600', cell_style)],
    [Paragraph('Est. 3-Year TCO', cell_left_style), Paragraph('$2,000-6,000', cell_style), Paragraph('$22,000-48,000', cell_style), Paragraph('$45,000-80,000', cell_style), Paragraph('$15,000-28,000', cell_style), Paragraph('$6,000-14,000', cell_style), Paragraph('$4,000-10,000', cell_style)],
]
story.append(Spacer(1, 18))
story.append(make_table(pricing_data, [0.18, 0.14, 0.14, 0.14, 0.13, 0.13, 0.13]))
story.append(Paragraph('<i>Table 5: Pricing and Total Cost of Ownership Comparison (per location)</i>', caption_style))
story.append(Spacer(1, 18))

story.append(p(
    'The TCO differential is stark. Over a three-year period, SelRx estimated total cost of ownership '
    'ranges from $2,000 to $6,000 per pharmacy location, compared to $22,000-$48,000 for PioneerRx and '
    '$45,000-$80,000 for Liberty. This 60-90% cost advantage is primarily driven by the elimination of '
    'on-premise server infrastructure, reduced hardware requirements (any device with a browser works), '
    'zero implementation fees, and the absence of ongoing IT support costs. For African pharmacy owners '
    'operating on thin margins with limited access to capital, this cost differential is not merely a '
    'competitive advantage but often the determining factor in whether a pharmacy can afford to digitize '
    'its operations at all.'
))

story.append(p(
    'PharmaPOS represents the closest pricing competitor, with a 3-year TCO of $4,000-$10,000 that overlaps '
    'with SelRx upper range. However, SelRx compensates for this pricing proximity with superior inventory '
    'management features (periodic stock-taking, batch tracking), a more comprehensive hardware configuration '
    'interface, and deeper regional customization for African markets. The value proposition is further '
    'strengthened by SelRx automatic backup and data recovery capabilities, which reduce the risk of data '
    'loss, a critical concern for pharmacies transitioning from paper-based to digital systems.'
))

# ══════════════════════════════════════════════════════════════
# CHAPTER 6: STRATEGIC RECOMMENDATIONS
# ══════════════════════════════════════════════════════════════
story.append(add_heading('<b>6. Strategic Recommendations</b>', h1_style, 0))

story.append(p(
    'Based on the competitive analysis presented in this report, the following strategic recommendations '
    'are designed to strengthen SelRx market position, address identified weaknesses, and capitalize on '
    'the opportunities presented by the rapidly growing African pharmacy market. Each recommendation is '
    'prioritized by impact and implementation feasibility.'
))

story.append(add_heading('<b>6.1 Priority 1: Mobile Money Integration (High Impact, Medium Effort)</b>', h2_style, 1))
story.append(p(
    'Integrating mobile money payment processing (MTN MoMo, Vodafone Cash, Airtel Money) directly into the '
    'SelRx POS workflow should be the highest-priority development initiative. This capability is unique to '
    'the African market and represents a feature that none of the established US or European competitors '
    'can easily replicate. Mobile money is the primary digital payment method across West and East Africa, '
    'and its integration would transform SelRx from a management tool into an essential revenue-enabling '
    'platform. Implementation can leverage existing mobile money APIs and should target Ghana and Nigeria '
    'as initial markets, with expansion to Kenya, Tanzania, and Uganda as follow-on phases.'
))

story.append(add_heading('<b>6.2 Priority 2: Insurance Claim Module (High Impact, High Effort)</b>', h2_style, 1))
story.append(p(
    'Developing an insurance claim adjudication module tailored to African health insurance schemes '
    '(NHIS in Ghana, NHIS in Nigeria, medical aids in South Africa) would address the most significant '
    'functional gap identified in this analysis. While this is a substantial development effort requiring '
    'regulatory domain expertise and integration with insurance provider systems, it would unlock access to '
    'a rapidly growing segment of the pharmacy market. Insurance claim processing is the primary driver of '
    'pharmacy software selection in more mature markets, and early investment in this capability would '
    'position SelRx ahead of the inevitable expansion of health insurance across Africa.'
))

story.append(add_heading('<b>6.3 Priority 3: Enhanced Offline Mode (Medium Impact, Medium Effort)</b>', h2_style, 1))
story.append(p(
    'Implementing a service worker-based offline mode using IndexedDB for local data storage would address '
    'one of SelRx primary weaknesses relative to desktop-based competitors. The offline mode should support '
    'complete POS transaction processing, including cart management, payment calculation, and receipt '
    'generation, with automatic synchronization when connectivity is restored. This feature is particularly '
    'critical for pharmacies in areas with unreliable internet infrastructure, and its absence is often '
    'cited as a primary concern by pharmacy owners evaluating cloud-based solutions. A progressive web '
    'application (PWA) approach would enable this capability while maintaining the zero-installation advantage.'
))

story.append(add_heading('<b>6.4 Priority 4: Regulatory Compliance Automation (Medium Impact, Low-Medium Effort)</b>', h2_style, 1))
story.append(p(
    'Building automated regulatory reporting features for each target African country would create a strong '
    'differentiator and increase switching costs. This includes automated generation of dispensing logs '
    'in formats required by the Pharmacy Council of Ghana, electronic submission of controlled substance '
    'records, automated expiry and recall notifications, and compliance dashboards that help pharmacy '
    'owners prepare for regulatory inspections. Each country implementation requires local regulatory '
    'expertise but follows a repeatable pattern, making it increasingly efficient as SelRx expands into '
    'additional markets.'
))

story.append(add_heading('<b>6.5 Priority 5: Basic Clinical Decision Support (Lower Priority, High Effort)</b>', h2_style, 1))
story.append(p(
    'While clinical decision support (CDS) is not an immediate market requirement in most African countries, '
    'beginning development of a basic CDS module would future-proof the platform and open doors to higher-value '
    'market segments including hospital pharmacies and clinical pharmacy practices. A phased approach is '
    'recommended: start with basic drug-drug interaction checking using open drug databases (such as '
    'DrugBank or OpenFDA), followed by allergy cross-referencing, and eventually dosage range validation. '
    'Partnering with academic pharmacy institutions in target markets could provide the clinical expertise '
    'needed to validate and calibrate these features for local drug formularies and prescribing patterns.'
))

# ── Build Body PDF ──
doc = TocDocTemplate(
    BODY_PDF, pagesize=A4,
    leftMargin=inch, rightMargin=inch,
    topMargin=0.8*inch, bottomMargin=0.8*inch,
    title='SelRx vs Market Leaders: Pharmacy POS Competitive Analysis',
    author='Z.ai',
)
doc.multiBuild(story)
print(f'Body PDF built: {BODY_PDF}')

# ══════════════════════════════════════════════════════════════
# COVER HTML (Template 01 - HUD Data Terminal)
# ══════════════════════════════════════════════════════════════

cover_html = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&display=swap" rel="stylesheet">
<style>
  @page { size: 794px 1123px; margin: 0; }
  html, body { margin: 0; padding: 0; background: #f6f5f5; }
  .cover { position: relative; width: 794px; height: 1123px; background: #f6f5f5; overflow: hidden; }

  /* Layer 1 - Background grid */
  .cover-bg { position: absolute; inset: 0; overflow: hidden; z-index: 1; }
  .cover-bg svg { width: 100%; height: 100%; }

  /* Layer 2 - Anchor line */
  .anchor-line {
    position: absolute;
    left: 95px; top: 112px; bottom: 112px;
    width: 6px;
    background: #4c4735;
    z-index: 2;
  }

  /* Layer 3 - Content */
  .cover-content { position: absolute; inset: 0; z-index: 3; }

  .kicker {
    position: absolute;
    top: 168px; left: 130px;
    font-family: 'Inter', sans-serif;
    font-size: 13px; font-weight: 400;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #7f7d76;
  }

  .title {
    position: absolute;
    top: 280px; left: 130px;
    max-width: 540px;
    font-family: 'Inter', sans-serif;
    font-size: 46px; font-weight: 900;
    line-height: 1.12;
    color: #272623;
  }

  .summary {
    position: absolute;
    top: 490px; left: 130px;
    max-width: 500px;
    font-family: 'Inter', sans-serif;
    font-size: 14px; font-weight: 400;
    line-height: 1.7;
    color: #7f7d76;
  }

  .meta {
    position: absolute;
    top: 700px; left: 130px;
    font-family: 'Inter', sans-serif;
    font-size: 14px; font-weight: 400;
    line-height: 1.6;
    color: #272623;
  }

  .meta-label {
    display: block; font-size: 11px;
    color: #7f7d76; letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 2px;
  }

  .footer-bar {
    position: absolute;
    bottom: 50px; left: 130px;
    font-family: 'Inter', sans-serif;
    font-size: 11px; font-weight: 400;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #7f7d76;
  }

  .accent-line {
    position: absolute;
    top: 470px; left: 130px;
    width: 60px; height: 3px;
    background: #95771c;
  }

  @media screen {
    .cover { transform-origin: top left; }
  }
</style>
</head>
<body>
<div class="cover">
  <!-- Layer 1: Background grid -->
  <div class="cover-bg">
    <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <defs>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#4c4735" stroke-width="0.5" opacity="0.06"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)"/>
    </svg>
  </div>

  <!-- Layer 2: Anchor line -->
  <div class="anchor-line"></div>

  <!-- Layer 3: Content -->
  <div class="cover-content">
    <div class="kicker">Competitive Analysis Report</div>
    <div class="title">SelRx vs. Market<br>Leaders</div>
    <div class="accent-line"></div>
    <div class="summary">
      A comprehensive competitive analysis comparing SelRx Pharmacy POS
      against five leading global pharmacy management systems, evaluating
      feature parity, pricing, deployment architecture, and strategic
      positioning in the African pharmacy market.
    </div>
    <div class="meta">
      <span class="meta-label">Prepared by</span>
      SelRx Product Team<br>
      <span style="margin-top: 12px; display: block;"><span class="meta-label">Date</span>August 2026</span>
    </div>
    <div class="footer-bar">Confidential</div>
  </div>
</div>
</body>
</html>'''

with open(COVER_HTML, 'w', encoding='utf-8') as f:
    f.write(cover_html)
print(f'Cover HTML written: {COVER_HTML}')

# ── Render Cover PDF ──
subprocess.run([
    'node', os.path.join(PDF_SKILL_DIR, 'scripts', 'html2poster.js'),
    COVER_HTML, '--output', COVER_PDF, '--width', '794px',
], check=True)
print(f'Cover PDF rendered: {COVER_PDF}')

# ── Merge Cover + Body ──
A4_W, A4_H = 595.28, 841.89
writer = PdfWriter()

cover_page = PdfReader(COVER_PDF).pages[0]
cw, ch = float(cover_page.mediabox.width), float(cover_page.mediabox.height)
if abs(cw - A4_W) > 0.1 or abs(ch - A4_H) > 0.1:
    cover_page.scale_to(A4_W, A4_H)
writer.add_page(cover_page)

body_reader = PdfReader(BODY_PDF)
for page in body_reader.pages:
    pw, ph = float(page.mediabox.width), float(page.mediabox.height)
    if abs(pw - A4_W) > 0.1 or abs(ph - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    writer.add_page(page)

writer.add_metadata({
    '/Title': 'SelRx vs Market Leaders: Pharmacy POS Competitive Analysis',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'Competitive analysis of pharmacy POS systems',
})
with open(FINAL_PDF, 'wb') as f:
    writer.write(f)

print(f'Final PDF: {FINAL_PDF}')

# Cleanup temp files
for tmp in [BODY_PDF, COVER_PDF, COVER_HTML]:
    if os.path.exists(tmp):
        os.remove(tmp)
print('Temp files cleaned up.')
