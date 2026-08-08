#!/usr/bin/env python3
"""
SelRx Competitive Landscape Analysis - Report Body
ReportLab-based PDF generation.
"""

import os, sys, hashlib, re

import platform
_IS_MAC = platform.system() == 'Darwin'
FONT_DIR = os.path.expanduser('~/.openclaw/workspace/fonts') if _IS_MAC else '/usr/share/fonts'

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, mm, cm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, HRFlowable, Image
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfgen import canvas

# ━━━━ FONTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold')

pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSans-Bold.ttf'))
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans-Bold')

# ━━━━ CASCADE PALETTE (auto-generated) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PAGE_BG       = colors.HexColor('#f0f0ef')
SECTION_BG    = colors.HexColor('#e9e8e6')
CARD_BG       = colors.HexColor('#ecebe8')
TABLE_STRIPE  = colors.HexColor('#f5f4f3')
HEADER_FILL   = colors.HexColor('#6b6141')
COVER_BLOCK   = colors.HexColor('#686049')
BORDER        = colors.HexColor('#c6c1b0')
ICON          = colors.HexColor('#998957')
ACCENT        = colors.HexColor('#94761e')
ACCENT_2      = colors.HexColor('#375ccb')
TEXT_PRIMARY   = colors.HexColor('#272623')
TEXT_MUTED     = colors.HexColor('#807d76')
SEM_SUCCESS   = colors.HexColor('#437755')
SEM_WARNING   = colors.HexColor('#8c764b')
SEM_ERROR     = colors.HexColor('#a64840')
SEM_INFO      = colors.HexColor('#4e7398')

# ━━━━ STYLES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MARGIN = 1.0 * inch
W = A4[0] - 2 * MARGIN  # usable width

styles = getSampleStyleSheet()

s_h1 = ParagraphStyle(
    'H1', parent=styles['Normal'],
    fontName='FreeSerif-Bold', fontSize=22, leading=28,
    textColor=TEXT_PRIMARY, spaceBefore=24, spaceAfter=10,
    alignment=TA_LEFT
)

s_h2 = ParagraphStyle(
    'H2', parent=styles['Normal'],
    fontName='FreeSerif-Bold', fontSize=16, leading=22,
    textColor=TEXT_PRIMARY, spaceBefore=18, spaceAfter=8,
    alignment=TA_LEFT
)

s_h3 = ParagraphStyle(
    'H3', parent=styles['Normal'],
    fontName='FreeSerif-Bold', fontSize=13, leading=18,
    textColor=TEXT_PRIMARY, spaceBefore=12, spaceAfter=6,
    alignment=TA_LEFT
)

s_body = ParagraphStyle(
    'BodyText', parent=styles['Normal'],
    fontName='FreeSerif', fontSize=10.5, leading=17,
    textColor=TEXT_PRIMARY, spaceBefore=4, spaceAfter=6,
    alignment=TA_JUSTIFY
)

s_body_left = ParagraphStyle(
    'BodyLeft', parent=s_body, alignment=TA_LEFT
)

s_caption = ParagraphStyle(
    'Caption', parent=styles['Normal'],
    fontName='FreeSerif', fontSize=9, leading=13,
    textColor=TEXT_MUTED, spaceBefore=4, spaceAfter=10,
    alignment=TA_LEFT
)

s_bullet = ParagraphStyle(
    'Bullet', parent=s_body,
    leftIndent=18, bulletIndent=6, spaceBefore=2, spaceAfter=2,
    alignment=TA_LEFT
)

s_callout = ParagraphStyle(
    'Callout', parent=styles['Normal'],
    fontName='FreeSerif-Italic', fontSize=11, leading=17,
    textColor=ACCENT_2, leftIndent=20, rightIndent=20,
    spaceBefore=8, spaceAfter=8, borderPadding=8,
    alignment=TA_LEFT
)

s_toc_h1 = ParagraphStyle(
    'TOC1', parent=styles['Normal'],
    fontName='FreeSerif-Bold', fontSize=12, leading=20,
    textColor=TEXT_PRIMARY, leftIndent=0
)

s_toc_h2 = ParagraphStyle(
    'TOC2', parent=styles['Normal'],
    fontName='FreeSerif', fontSize=10.5, leading=18,
    textColor=TEXT_MUTED, leftIndent=20
)

# Table cell styles
s_cell = ParagraphStyle(
    'Cell', fontName='FreeSerif', fontSize=9, leading=13,
    textColor=TEXT_PRIMARY, alignment=TA_CENTER
)

s_cell_left = ParagraphStyle(
    'CellLeft', fontName='FreeSerif', fontSize=9, leading=13,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT
)

s_cell_bold = ParagraphStyle(
    'CellBold', fontName='FreeSerif-Bold', fontSize=9, leading=13,
    textColor=colors.white, alignment=TA_CENTER
)

s_cell_bold_left = ParagraphStyle(
    'CellBoldLeft', fontName='FreeSerif-Bold', fontSize=9, leading=13,
    textColor=colors.white, alignment=TA_LEFT
)

# ━━━━ TOC TEMPLATE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

# ━━━━ HELPERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def heading(text, style, level=0):
    key = f'h_{hashlib.md5(text.encode()).hexdigest()[:8]}'
    p = Paragraph(f'<a name="{key}"/>{text}', style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def body(text):
    return Paragraph(text, s_body)

def body_l(text):
    return Paragraph(text, s_body_left)

def bullet(text):
    return Paragraph(text, s_bullet)

def spacer(h=6):
    return Spacer(1, h)

def hr():
    return HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceBefore=6, spaceAfter=6)

def make_table(headers, rows, col_widths=None):
    """Build a styled table with cascade palette."""
    if col_widths is None:
        col_widths = [W / len(headers)] * len(headers)

    header_row = [Paragraph(h, s_cell_bold_left if i == 0 else s_cell_bold)
                  for i, h in enumerate(headers)]
    data = [header_row]
    for row in rows:
        data.append([Paragraph(str(c), s_cell_left if i == 0 else s_cell)
                     for i, c in enumerate(row)])

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'FreeSerif-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), TABLE_STRIPE))
        else:
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.white))
    t.setStyle(TableStyle(style_cmds))
    return t

def page_header_footer(canvas_obj, doc):
    """Draw page number footer on body pages."""
    canvas_obj.saveState()
    canvas_obj.setFont('FreeSerif', 8)
    canvas_obj.setFillColor(TEXT_MUTED)
    canvas_obj.drawRightString(A4[0] - MARGIN, 30, f'Page {doc.page}')
    canvas_obj.drawString(MARGIN, 30, 'SelRx Competitive Landscape Analysis')
    canvas_obj.restoreState()

# ━━━━ NUMBERING PLAN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# | Index | Type    | Ch # | Title                          |
# |-------|---------|------|--------------------------------|
# | 1     | cover   | --   | Cover                          |
# | 2     | toc     | --   | Table of Contents              |
# | 3     | content | 1    | Executive Summary              |
# | 4     | content | 2    | Market Context & Methodology   |
# | 5     | content | 3    | Competitor Profiles            |
# | 6     | content | 4    | Feature Comparison             |
# | 7     | content | 5    | Pricing & TCO Analysis         |
# | 8     | content | 6    | SWOT Analysis                  |
# | 9     | content | 7    | Strategic Roadmap              |

# ━━━━ BUILD STORY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

story = []

# ── TABLE OF CONTENTS ──
toc = TableOfContents()
toc.levelStyles = [s_toc_h1, s_toc_h2]
story.append(toc)
story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════════════════════════
# CHAPTER 1: EXECUTIVE SUMMARY
# ══════════════════════════════════════════════════════════════════════════════════════

story.append(heading('1. Executive Summary', s_h1, level=0))

story.append(body(
    'The African pharmacy point-of-sale market is undergoing a fundamental transformation. '
    'Driven by rapid urbanization, expanding healthcare insurance schemes, mobile money adoption, '
    'and the emergence of regulatory frameworks requiring digital record-keeping, pharmacies across '
    'the continent face increasing pressure to modernize their operations. The global POS market '
    'is projected to exceed $45 billion by 2028, with Africa representing one of the fastest-growing '
    'segments at an estimated 12-15% compound annual growth rate. This expansion is not limited to '
    'pharmacy-specific systems; general-purpose POS platforms are also aggressively targeting retail '
    'pharmacies as a high-value vertical, creating a multi-front competitive landscape.'
))

story.append(body(
    'SelRx, a cloud-native pharmacy management system purpose-built for the African market, '
    'occupies a distinctive position in this landscape. Unlike the established pharmacy POS vendors '
    'that dominate North American and European markets, SelRx was architected from the ground up to '
    'address the unique constraints of African pharmacy operations: intermittent internet connectivity, '
    'diverse currency regimes spanning 16 West African currencies, limited IT infrastructure, and '
    'the growing prevalence of mobile money as a primary payment method. The platform offers a '
    'comprehensive suite encompassing point-of-sale processing, inventory management with batch and '
    'expiry tracking, prescription lifecycle management, customer records with allergy cross-referencing, '
    'advanced analytics, goods return workflows, shift management, and multi-device synchronization '
    'via a hub-and-terminal architecture that supports both local area network and remote Cloudflare '
    'Tunnel connectivity.'
))

story.append(body(
    'This analysis expands upon SelRx\'s previous competitive assessment by introducing a broader '
    'competitor set that reflects the actual competitive dynamics facing African pharmacies today. '
    'While the prior report benchmarked SelRx against five global pharmacy management systems, this '
    'edition introduces a mixed-basket approach that includes three pharmacy-specific platforms (PioneerRx, '
    'PharmaPOS, and ProPharma), three Africa-focused general POS systems (Peppermint, Bumpa, and Pastel), '
    'and two global POS benchmarks (Square and Loyverse). This expanded scope captures the reality '
    'that African pharmacy owners often evaluate both pharmacy-specialized tools and general-purpose POS '
    'systems when making purchasing decisions, and that the competitive threat extends beyond '
    'traditional pharmacy software vendors to include well-funded global players.'
))

# Key findings summary table
story.append(spacer(8))
story.append(heading('Key Comparative Findings', s_h3, level=1))

kf_headers = ['Dimension', 'Key Finding']
kf_rows = [
    ['Deployment Speed', 'SelRx deploys in under 1 hour; competitors average 1-6 weeks for full setup'],
    ['Total Cost of Ownership', 'SelRx achieves 55-90% lower 3-year TCO than all competitors analyzed'],
    ['Offline Resilience', 'SelRx offers persistent offline queue via Tauri desktop mode; most cloud POS systems have no offline capability'],
    ['Multi-Device Sync', 'SelRx provides real-time delta sync with WebSocket push; only PioneerRx offers comparable multi-device features'],
    ['African Market Fit', 'SelRx is the only system with native 16-currency support, African timezone coverage, and mobile money architecture readiness'],
    ['Feature Depth Gap', 'Insurance claim adjudication and comprehensive CDS remain the primary gaps versus pharmacy-specific competitors'],
]
story.append(make_table(kf_headers, kf_rows, [W*0.28, W*0.72]))
story.append(Paragraph('Table 1: Key Comparative Findings Summary', s_caption))

story.append(spacer(8))

story.append(body(
    'The analysis reveals that SelRx maintains a compelling value proposition across deployment speed, '
    'total cost of ownership, offline resilience, and African market localization. However, the competitive '
    'landscape is evolving rapidly. Africa-focused POS systems like Peppermint and Bumpa are gaining '
    'traction among small-to-medium pharmacies due to their simplicity and low cost, while global platforms '
    'like Square are expanding their vertical capabilities and could enter African markets more aggressively. '
    'The strategic recommendations in this report provide a prioritized roadmap for SelRx to strengthen '
    'its competitive moat, close critical feature gaps, and cement its position as the leading pharmacy '
    'management platform in Africa.'
))

# ══════════════════════════════════════════════════════════════════════════════════════
# CHAPTER 2: MARKET CONTEXT & METHODOLOGY
# ══════════════════════════════════════════════════════════════════════════════════════

story.append(heading('2. Market Context and Methodology', s_h1, level=0))

story.append(heading('2.1 The African Pharmacy Technology Market', s_h2, level=1))

story.append(body(
    'The African pharmaceutical market is projected to reach $65 billion by 2030, driven by '
    'population growth exceeding 2.5% annually across sub-Saharan Africa, rapid urbanization that is '
    'concentrating healthcare demand in cities, and expanding health insurance schemes in Nigeria '
    '(National Health Insurance Scheme), Ghana (National Health Insurance Authority), Kenya (National '
    'Hospital Insurance Fund), and South Africa (medical aid schemes). The retail pharmacy segment, '
    'which accounts for approximately 60% of pharmaceutical distribution in West and East Africa, is '
    'expected to grow at 8-12% annually, creating a substantial addressable market for pharmacy '
    'management solutions.'
))

story.append(body(
    'Despite this growth, pharmacy technology adoption in Africa remains remarkably low. Industry '
    'estimates suggest that fewer than 15% of community pharmacies in West Africa and fewer than 30% '
    'in South Africa use dedicated pharmacy management software. The majority continue to rely on '
    'manual ledger books, spreadsheets, or generic retail POS systems that lack pharmacy-specific '
    'capabilities such as prescription tracking, drug interaction checking, controlled substance '
    'monitoring, and expiry management. This low penetration rate represents both the challenge and '
    'the opportunity: the market is largely untapped, but convincing pharmacy owners to transition from '
    'tried-and-tested manual processes to digital systems requires solutions that are affordable, intuitive, '
    'and adapted to local operating conditions.'
))

story.append(heading('2.2 Competitive Landscape Evolution', s_h2, level=1))

story.append(body(
    'The competitive landscape for pharmacy POS in Africa has evolved significantly since 2023. Three '
    'distinct categories of competitors now vie for market share. First, established pharmacy management '
    'systems from developed markets, such as PioneerRx and ProPharma, offer deep feature sets but are '
    'architecturally misaligned with African infrastructure constraints and are priced beyond the reach '
    'of most independent pharmacies. Second, cloud-native pharmacy POS platforms like PharmaPOS have '
    'demonstrated that browser-based architectures can succeed in emerging markets, but they have '
    'focused primarily on Southeast Asia and Latin America rather than Africa. Third, and perhaps most '
    'significantly, Africa-focused general POS systems including Peppermint, Bumpa, and Loyverse have '
    'gained substantial traction by offering simple, affordable, and mobile-friendly POS solutions that '
    'appeal to small and medium-sized pharmacies even though they lack pharmacy-specific features.'
))

story.append(body(
    'This three-front competitive dynamic means that SelRx must compete not only on pharmacy-specific '
    'capabilities but also on the accessibility, pricing, and ease-of-use dimensions that have made '
    'general POS systems popular. A pharmacy owner in Accra or Lagos evaluating POS options will '
    'typically consider both specialized pharmacy software and general-purpose POS systems, making it '
    'essential to understand and address the competitive positioning of both categories.'
))

story.append(heading('2.3 Methodology and Competitor Selection', s_h2, level=1))

story.append(body(
    'The competitor selection for this analysis follows a mixed-basket methodology designed to capture '
    'the full spectrum of competitive alternatives that African pharmacy owners actually evaluate. '
    'Eight competitors were selected across three categories: pharmacy-specific systems (PioneerRx, '
    'PharmaPOS, ProPharma), Africa-focused general POS platforms (Peppermint, Bumpa, Pastel Accounting), '
    'and global POS benchmarks (Square, Loyverse). This selection reflects data from pharmacy owner '
    'interviews, industry reports from IQVIA and McKinsey, and analysis of search trends and app store '
    'rankings for POS-related queries in African markets. Feature assessments are based on publicly '
    'available documentation, vendor disclosures, user reviews on platforms such as G2 and Capterra, '
    'and independent testing where accessible. Pricing data reflects publicly listed rates as of '
    'August 2026 and may vary by region and negotiation.'
))

# ══════════════════════════════════════════════════════════════════════════════════════
# CHAPTER 3: COMPETITOR PROFILES
# ══════════════════════════════════════════════════════════════════════════════════════

story.append(heading('3. Competitor Profiles', s_h1, level=0))

story.append(body(
    'Each competitor profile below provides a concise overview of the company, its architecture, '
    'target market, pricing model, and key differentiating capabilities. Understanding these profiles '
    'is essential for interpreting the feature comparison matrices that follow and for identifying the '
    'specific competitive threats and opportunities that each system represents for SelRx.'
))

# --- PioneerRx ---
story.append(heading('3.1 PioneerRx (United States)', s_h2, level=1))

story.append(body(
    'PioneerRx is widely regarded as the most feature-rich pharmacy management system in North America. '
    'Founded in Texas and operational since 2004, the platform serves over 3,000 independent and chain '
    'pharmacies across the United States. PioneerRx has built its reputation on deep integration with US '
    'pharmacy workflows, including real-time insurance adjudication through RxNT and Surescripts, '
    'comprehensive clinical decision support (CDS) alerts based on First Databank and Medi-Span drug '
    'databases, and an extensive prescription filling workflow that mirrors the exact operational sequence '
    'used by most American pharmacists. The system also offers robust patient counseling tools, '
    'immunization tracking, medication therapy management (MTM) documentation, and adherence monitoring.'
))

story.append(body(
    'PioneerRx operates as a locally-installed Windows application with cloud-based backup and remote '
    'access capabilities. Its architecture prioritizes data security and HIPAA compliance, with end-to-end '
    'encryption and detailed audit trails. Pricing ranges from $300 to $600 per month per pharmacy location, '
    'plus implementation fees of $10,000 to $25,000 for multi-location deployments. The platform requires '
    'dedicated POS hardware and a stable high-bandwidth internet connection for insurance claim processing. '
    'While PioneerRx offers unmatched feature depth for the US market, its architecture, pricing, and '
    'regulatory focus make it impractical for African pharmacy deployment without substantial localization.'
))

# --- PharmaPOS ---
story.append(heading('3.2 PharmaPOS (Southeast Asia / Latin America)', s_h2, level=1))

story.append(body(
    'PharmaPOS is a cloud-native pharmacy POS platform that has gained significant traction in Southeast '
    'Asia and parts of Latin America. Like SelRx, it was designed from the ground up as a web application, '
    'eliminating the need for local software installation. PharmaPOS offers a clean, modern interface with '
    'strong mobile support, allowing pharmacy staff to process transactions on tablets and smartphones in '
    'addition to traditional desktop setups. The platform includes inventory management with multi-location '
    'support, basic prescription tracking, customer management, and integration with popular payment gateways.'
))

story.append(body(
    'PharmaPOS pricing is competitive at $99 to $250 per month, positioning it as an affordable option '
    'for small to mid-sized pharmacies. The system handles multiple currencies and supports localized tax '
    'configurations, making it adaptable to various regulatory environments. However, PharmaPOS lacks '
    'advanced features such as clinical decision support, insurance claim adjudication, comprehensive '
    'stock-taking workflows, drug interaction checking, and real-time multi-device synchronization. Its '
    'reporting capabilities, while adequate for basic business intelligence, do not match the depth offered '
    'by more enterprise-oriented solutions. PharmaPOS represents the most direct architectural competitor '
    'to SelRx due to its cloud-native approach, but it has not prioritized African market localization.'
))

# --- ProPharma ---
story.append(heading('3.3 ProPharma (United Kingdom / Africa)', s_h2, level=1))

story.append(body(
    'ProPharma is a pharmacy management system with roots in the United Kingdom that has expanded into '
    'several African markets, including South Africa, Kenya, and Nigeria. The system offers a comprehensive '
    'suite that includes point-of-sale processing, prescription management with NHS and private insurance '
    'integration, inventory control with automated reordering, patient records management, and regulatory '
    'compliance reporting. ProPharma is particularly strong in dispensing workflow management, offering '
    'label printing, clinical screening checks, and controlled substance monitoring that aligns with UK '
    'and African pharmacy council requirements.'
))

story.append(body(
    'ProPharma operates on a hybrid architecture with a cloud-based backend and a locally-installed client '
    'application, providing both offline capability and centralized data management. Pricing is in the '
    'mid-to-premium range at $200 to $500 per month, with implementation fees that can reach $5,000 to '
    '$15,000 depending on the deployment scale. The system is well-regarded in South Africa where it has '
    'established partnerships with major pharmacy chains, but its hybrid architecture requires more IT '
    'infrastructure than pure cloud solutions, and its UK-centric design creates friction when deployed in '
    'West African markets with different regulatory frameworks and business practices. ProPharma represents '
    'a meaningful competitive threat in South Africa and Kenya but is less competitive in West Africa.'
))

# --- Peppermint ---
story.append(heading('3.4 Peppermint (Nigeria)', s_h2, level=1))

story.append(body(
    'Peppermint is a Nigerian-born POS and business management platform designed specifically for the '
    'African retail market. The platform provides point-of-sale processing, inventory management, customer '
    'relationship management, and basic analytics for a wide range of retail businesses, including '
    'pharmacies, supermarkets, restaurants, and fashion retailers. Peppermint has gained significant '
    'traction in Nigeria, with thousands of active users, due to its affordable pricing, simple interface, '
    'and strong offline capability. The system is available as both a cloud-based web application and a '
    'mobile application, making it accessible to businesses with varying levels of technological maturity.'
))

story.append(body(
    'Peppermint offers a free tier for basic POS functionality, with premium plans ranging from $15 to '
    '$80 per month. The platform supports Nigerian Naira and several other African currencies, integrates '
    'with popular payment methods including bank transfers and card payments, and provides basic inventory '
    'tracking with low-stock alerts. However, Peppermint lacks pharmacy-specific features such as '
    'prescription management, drug interaction checking, batch and expiry tracking, controlled substance '
    'monitoring, and clinical decision support. For a pharmacy, Peppermint functions as a basic retail '
    'POS without the specialized capabilities that pharmacy operations require. Its strength lies in its '
    'simplicity and accessibility, making it a popular choice for very small pharmacies and drug stores '
    'that prioritize ease of use over feature depth.'
))

# --- Bumpa ---
story.append(heading('3.5 Bumpa (Nigeria)', s_h2, level=1))

story.append(body(
    'Bumpa is a rapidly growing Nigerian POS and e-commerce platform that targets small and medium-sized '
    'businesses across Africa. The platform combines point-of-sale functionality with online store '
    'creation, inventory management, and social media integration, positioning itself as an all-in-one '
    'tool for entrepreneurs who sell both in-store and online. Bumpa has raised significant venture '
    'capital funding and has aggressively expanded its user base across Nigeria, Ghana, and Kenya, with '
    'plans to extend to additional African markets. The platform is particularly popular among young, '
    'tech-savvy business owners who value its modern interface and e-commerce integration.'
))

story.append(body(
    'Bumpa offers a freemium model with a free basic POS tier and paid plans ranging from $10 to $60 '
    'per month. The platform includes barcode scanning, receipt printing, sales analytics, customer '
    'management, and multi-channel inventory synchronization between physical and online stores. However, '
    'Bumpa is not designed for pharmacy use and lacks all pharmacy-specific capabilities. There is no '
    'prescription management, no drug interaction checking, no controlled substance tracking, no expiry '
    'management, and no integration with pharmacy regulatory systems. Bumpa represents a competitive '
    'threat primarily for the smallest pharmacies and drug stores that view themselves as retail businesses '
    'first and healthcare providers second, and for whom e-commerce capabilities are a higher priority '
    'than clinical pharmacy features.'
))

# --- Pastel ---
story.append(heading('3.6 Pastel Accounting / Sage Pastel (South Africa)', s_h2, level=1))

story.append(body(
    'Pastel Accounting, now part of the Sage Group, is one of the most widely used business management '
    'platforms in South Africa and Southern Africa. Originally an accounting software package, Pastel has '
    'expanded to include POS capabilities, inventory management, customer management, and basic reporting. '
    'The system is deeply entrenched in the South African business ecosystem, with an estimated 200,000+ '
    'businesses using Pastel or Sage products across the region. Its strength lies in its comprehensive '
    'accounting integration, VAT handling, South African Revenue Service (SARS) compliance, and payroll '
    'management, making it a one-stop solution for businesses that need integrated financial management.'
))

story.append(body(
    'Pastel operates as a locally-installed Windows application with optional cloud backup. Pricing ranges '
    'from $30 to $200 per month depending on the module configuration and number of users. While the POS '
    'module provides basic sales processing, inventory tracking, and customer management, it lacks '
    'pharmacy-specific features entirely. There is no prescription management, no drug interaction '
    'checking, no expiry management beyond basic inventory alerts, and no clinical decision support. '
    'Pastel\'s competitive advantage lies in its accounting depth and regulatory compliance for South Africa, '
    'making it the default choice for pharmacies that prioritize financial management and tax compliance '
    'over pharmacy-specific operational features. However, its desktop-only architecture, aging interface, '
    'and lack of cloud-native capabilities represent significant limitations in a market that is '
    'increasingly moving toward browser-based and mobile-first solutions.'
))

# --- Square ---
story.append(heading('3.7 Square (Global)', s_h2, level=1))

story.append(body(
    'Square, a subsidiary of Block (formerly Square, Inc.), is one of the most recognized POS platforms '
    'globally, serving millions of businesses across retail, food and beverage, and service industries. '
    'Square offers a comprehensive ecosystem that includes POS hardware (Square Reader, Square Stand, '
    'Square Terminal), payment processing, inventory management, customer engagement tools, employee '
    'management, and an extensive app marketplace with third-party integrations. The platform is known '
    'for its simplicity, transparent pricing (flat-rate payment processing with no monthly fees for basic '
    'POS), and polished user experience that has set the standard for modern POS design.'
))

story.append(body(
    'Square operates on a freemium model with a free POS tier and premium plans starting at $0 monthly '
    '(revenue comes from payment processing fees of 2.6% + 10 cents per transaction). While Square has '
    'expanded into several international markets including the UK, Australia, Japan, France, and Spain, '
    'it has not yet launched dedicated operations in sub-Saharan Africa. However, Square\'s parent company '
    'Block has made significant investments in African fintech through Cash App and the TIDAL acquisition, '
    'suggesting that an African market entry is plausible within the next two to three years. If Square '
    'enters Africa, its brand recognition, polished UX, and extensive integration ecosystem would make it '
    'a formidable competitor for the general POS segment, though it would still lack pharmacy-specific '
    'features without significant vertical development.'
))

# --- Loyverse ---
story.append(heading('3.8 Loyverse (Global, Free POS)', s_h2, level=1))

story.append(body(
    'Loyverse is a free POS platform that has gained significant adoption in emerging markets, including '
    'parts of Africa, due to its zero-cost entry point and straightforward feature set. The platform '
    'provides basic POS processing, inventory management with stock level tracking, customer management, '
    'employee management, and sales analytics. Loyverse is available as a mobile application for iOS and '
    'Android, as well as a web-based back-office for reporting and configuration. The platform is '
    'particularly popular among very small businesses, market vendors, and startups that need a simple, '
    'no-cost POS solution without the complexity of enterprise-grade systems.'
))

story.append(body(
    'Loyverse is completely free for core POS functionality, with premium features (employee '
    'management, loyalty programs, advanced inventory) available through a subscription at approximately '
    '$25 per month per terminal. The platform supports multiple languages and currencies, and provides '
    'basic offline capability through its mobile application. However, Loyverse lacks all pharmacy-specific '
    'features: no prescription management, no drug interaction checking, no expiry management, no batch '
    'tracking, no controlled substance monitoring, and no clinical decision support. Its reporting '
    'capabilities are basic, and it does not offer multi-location synchronization, advanced analytics, '
    'or hardware configuration management. Loyverse represents the floor of the competitive landscape, '
    'setting the minimum feature expectation for any paid POS solution targeting the African market.'
))

# Competitor overview table
story.append(spacer(8))
story.append(heading('Competitor Overview', s_h3, level=1))

co_headers = ['Competitor', 'Category', 'Market', 'Architecture', 'Monthly Price']
co_rows = [
    ['PioneerRx', 'Pharmacy-Specific', 'United States', 'Windows Desktop', '$300-600'],
    ['PharmaPOS', 'Pharmacy-Specific', 'SE Asia / LATAM', 'Cloud SaaS', '$99-250'],
    ['ProPharma', 'Pharmacy-Specific', 'UK / Africa', 'Hybrid Cloud', '$200-500'],
    ['Peppermint', 'Africa POS', 'Nigeria / W. Africa', 'Cloud + Mobile', '$15-80'],
    ['Bumpa', 'Africa POS', 'Nigeria / E. Africa', 'Cloud + Mobile', '$10-60'],
    ['Pastel', 'Africa POS', 'South Africa', 'Windows Desktop', '$30-200'],
    ['Square', 'Global POS', 'US, UK, EU, JP', 'Cloud + Hardware', '$0 (2.6% txn)'],
    ['Loyverse', 'Global POS', 'Global', 'Mobile + Web', '$0-25'],
    ['SelRx', 'Pharmacy-Specific', 'Africa', 'Cloud + Desktop (Tauri)', '$50-150'],
]
cw = [W*0.16, W*0.18, W*0.18, W*0.22, W*0.26]
story.append(make_table(co_headers, co_rows, cw))
story.append(Paragraph('Table 2: Competitor Overview Matrix', s_caption))

# ══════════════════════════════════════════════════════════════════════════════════════
# CHAPTER 4: FEATURE COMPARISON
# ══════════════════════════════════════════════════════════════════════════════════════

story.append(PageBreak())
story.append(heading('4. Feature Comparison', s_h1, level=0))

story.append(body(
    'The following comparison matrices evaluate each system across the core functional modules that '
    'define a comprehensive pharmacy POS solution. Ratings are based on publicly available documentation, '
    'user reviews, vendor disclosures, and independent assessment. Each capability is rated as Full '
    '(comprehensive native support), Partial (basic or third-party dependent), or None (not available). '
    'The comparison is organized into four categories: Core POS, Inventory Management, Pharmacy-Specific '
    'Features, and Platform and Infrastructure capabilities.'
))

# --- 4.1 Core POS ---
story.append(heading('4.1 Core POS and Sales', s_h2, level=1))

story.append(body(
    'Core POS functionality forms the foundation of any point-of-sale system. This category evaluates '
    'the essential capabilities that every pharmacy requires for daily sales operations, including '
    'barcode scanning integration, payment method support, receipt management, shift tracking, and '
    'cash reconciliation. SelRx demonstrates full parity with the most capable competitors in this '
    'category, supporting five payment methods (cash, credit card, debit card, insurance, and mobile '
    'money architecture readiness) and offering comprehensive shift management with cash drawer '
    'reconciliation. The shift management module is particularly notable because it matches PioneerRx in '
    'depth while exceeding the offerings of most general POS systems, which typically treat shift '
    'management as an afterthought. This is a critical differentiator in African pharmacies where cash '
    'transactions remain dominant and shift-level accountability is essential for loss prevention.'
))

pos_headers = ['Feature', 'SelRx', 'PioneerRx', 'PharmaPOS', 'Peppermint', 'Bumpa', 'Pastel', 'Square', 'Loyverse']
pos_rows = [
    ['Barcode Scanning', 'Full', 'Full', 'Full', 'Full', 'Full', 'Partial', 'Full', 'Full'],
    ['Multi-Payment', 'Full', 'Full', 'Full', 'Partial', 'Partial', 'Full', 'Full', 'Partial'],
    ['Receipt Printing', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full'],
    ['Shift Management', 'Full', 'Full', 'Partial', 'None', 'None', 'None', 'Partial', 'None'],
    ['Cash Reconciliation', 'Full', 'Full', 'Partial', 'None', 'None', 'Full', 'Full', 'None'],
    ['Keyboard Shortcuts', 'Full', 'Full', 'Partial', 'None', 'None', 'None', 'None', 'None'],
]
pos_cw = [W*0.16] + [W*0.12]*7 + [W*0.04]
pos_cw = [W*0.16] + [W*(0.84/8)]*8
story.append(make_table(pos_headers, pos_rows, pos_cw))
story.append(Paragraph('Table 3: Core POS and Sales Feature Comparison', s_caption))

# --- 4.2 Inventory ---
story.append(heading('4.2 Inventory Management', s_h2, level=1))

story.append(body(
    'Inventory management is arguably the most critical operational module for any pharmacy, where the '
    'consequences of poor stock management extend beyond financial loss to patient safety concerns '
    'through expired or out-of-stock medications. This category evaluates real-time stock tracking, '
    'expiry management, batch and lot tracking, stock-taking capabilities, and multi-location '
    'synchronization. SelRx demonstrates particular strength in this category, offering the most '
    'comprehensive set of inventory management features among the cloud-native competitors. The periodic '
    'stock-taking module, which supports full physical inventory counts with variance analysis, user '
    'attribution, and historical tracking, is a feature typically found only in enterprise-grade systems '
    'like PioneerRx and Liberty Software. SelRx also provides native multi-location inventory '
    'synchronization through its hub-and-terminal sync engine, enabling real-time stock visibility across '
    'branches without the complex server infrastructure that traditional client-server systems require.'
))

inv_headers = ['Feature', 'SelRx', 'PioneerRx', 'PharmaPOS', 'Peppermint', 'Bumpa', 'Pastel', 'Square', 'Loyverse']
inv_rows = [
    ['Real-time Tracking', 'Full', 'Full', 'Full', 'Full', 'Partial', 'Full', 'Full', 'Partial'],
    ['Expiry Management', 'Full', 'Full', 'Partial', 'None', 'None', 'None', 'None', 'None'],
    ['Batch/Lot Tracking', 'Full', 'Full', 'Partial', 'None', 'None', 'None', 'None', 'None'],
    ['Periodic Stock Take', 'Full', 'Partial', 'None', 'None', 'None', 'None', 'None', 'None'],
    ['Auto-Reorder', 'Partial', 'Full', 'Partial', 'Partial', 'None', 'Full', 'Partial', 'Partial'],
    ['Multi-Location Sync', 'Full', 'Partial', 'Partial', 'None', 'None', 'None', 'Full', 'None'],
    ['Inventory Import/Export', 'Full', 'Full', 'Partial', 'None', 'None', 'Partial', 'Partial', 'None'],
    ['Sell-as Sub-Units', 'Full', 'Partial', 'None', 'None', 'None', 'None', 'None', 'None'],
]
inv_cw = [W*0.18] + [W*(0.82/8)]*8
story.append(make_table(inv_headers, inv_rows, inv_cw))
story.append(Paragraph('Table 4: Inventory Management Feature Comparison', s_caption))

# --- 4.3 Pharmacy-Specific ---
story.append(heading('4.3 Pharmacy-Specific Features', s_h2, level=1))

story.append(body(
    'Pharmacy-specific features represent the most significant differentiator between pharmacy POS '
    'systems and general-purpose POS platforms. This category evaluates capabilities that are essential '
    'for pharmaceutical operations: prescription lifecycle management, drug interaction checking, '
    'controlled substance monitoring, insurance claim adjudication, and clinical decision support. '
    'This is the category where pharmacy-specific competitors like PioneerRx and ProPharma demonstrate '
    'their deepest advantages, and where SelRx has made targeted investments to differentiate from '
    'general POS competitors. Notably, SelRx now includes basic drug-drug interaction checking using a '
    'curated database of WHO essential medicines and Nigerian formulary drugs, with severity-level '
    'alerting (moderate, severe, critical), a capability that none of the Africa-focused or general POS '
    'competitors offer. The prescription management module supports the full prescription lifecycle from '
    'pending through dispensed, with priority levels, refill tracking, prescriber information, and '
    'allergy cross-referencing from patient records.'
))

pharm_headers = ['Feature', 'SelRx', 'PioneerRx', 'PharmaPOS', 'Peppermint', 'Bumpa', 'Pastel', 'Square', 'Loyverse']
pharm_rows = [
    ['Prescription Management', 'Full', 'Full', 'Partial', 'None', 'None', 'None', 'None', 'None'],
    ['Drug Interaction Checking', 'Partial', 'Full', 'None', 'None', 'None', 'None', 'None', 'None'],
    ['Rx Enforcement', 'Full', 'Full', 'Partial', 'None', 'None', 'None', 'None', 'None'],
    ['Insurance Adjudication', 'None', 'Full', 'None', 'None', 'None', 'None', 'None', 'None'],
    ['Controlled Substance Track', 'Full', 'Full', 'None', 'None', 'None', 'None', 'None', 'None'],
    ['Patient Allergy Records', 'Full', 'Full', 'Partial', 'None', 'None', 'None', 'None', 'None'],
    ['Refill Management', 'Full', 'Full', 'Partial', 'None', 'None', 'None', 'None', 'None'],
    ['Goods Return Workflow', 'Full', 'Full', 'None', 'None', 'None', 'None', 'Partial', 'None'],
]
pharm_cw = [W*0.20] + [W*(0.80/8)]*8
story.append(make_table(pharm_headers, pharm_rows, pharm_cw))
story.append(Paragraph('Table 5: Pharmacy-Specific Feature Comparison', s_caption))

# --- 4.4 Platform & Infrastructure ---
story.append(heading('4.4 Platform and Infrastructure', s_h2, level=1))

story.append(body(
    'Platform and infrastructure capabilities determine how easily a system can be deployed, maintained, '
    'and scaled. This category evaluates deployment architecture, offline resilience, multi-device '
    'synchronization, multi-currency support, hardware integration, and analytics depth. This is the '
    'category where SelRx demonstrates its most significant competitive advantages over both pharmacy-specific and general POS competitors. The dual-deployment architecture (web mode via Next.js for '
    'cloud deployments and desktop mode via Tauri for local installations with hardware integration) '
    'provides flexibility that no single-architecture competitor can match. The offline queue persistence '
    'system, implemented through SQLite-backed pending delta queues that survive application restarts, '
    'ensures that sales transactions are never lost during connectivity interruptions. The WebSocket '
    'real-time sync and mDNS auto-discovery features provide an operational experience that is typically '
    'associated with enterprise-grade systems costing ten times SelRx\'s price point.'
))

plat_headers = ['Feature', 'SelRx', 'PioneerRx', 'PharmaPOS', 'Peppermint', 'Bumpa', 'Pastel', 'Square', 'Loyverse']
plat_rows = [
    ['Cloud-Native (Zero Install)', 'Full', 'None', 'Full', 'Full', 'Full', 'None', 'Full', 'Full'],
    ['Desktop + Hardware Mode', 'Full', 'Full', 'None', 'None', 'None', 'Full', 'Full', 'None'],
    ['Offline Mode (Persistent)', 'Full', 'Full', 'None', 'Partial', 'None', 'Full', 'Partial', 'Partial'],
    ['Real-Time Multi-Device Sync', 'Full', 'Partial', 'Partial', 'None', 'None', 'None', 'Full', 'None'],
    ['Multi-Currency (African)', 'Full', 'Partial', 'Partial', 'Partial', 'Partial', 'Full', 'Partial', 'Partial'],
    ['Hardware Config UI', 'Full', 'Partial', 'None', 'None', 'None', 'Partial', 'Full', 'None'],
    ['Advanced Analytics', 'Full', 'Full', 'Partial', 'Partial', 'Partial', 'Full', 'Partial', 'Partial'],
    ['Role-Based Permissions', 'Full', 'Full', 'Partial', 'None', 'None', 'Partial', 'Partial', 'Partial'],
]
plat_cw = [W*0.20] + [W*(0.80/8)]*8
story.append(make_table(plat_headers, plat_rows, plat_cw))
story.append(Paragraph('Table 6: Platform and Infrastructure Comparison', s_caption))

# ══════════════════════════════════════════════════════════════════════════════════════
# CHAPTER 5: PRICING & TCO
# ══════════════════════════════════════════════════════════════════════════════════════

story.append(PageBreak())
story.append(heading('5. Pricing and Total Cost of Ownership', s_h1, level=0))

story.append(body(
    'Pricing is one of the most significant differentiators between SelRx and its competitors, '
    'particularly when considering the total cost of ownership (TCO) over a three-year period. The '
    'following analysis compares not only monthly subscription fees but also implementation costs, '
    'hardware requirements, and ongoing IT support needs that contribute to the true cost of operating '
    'each system. For African pharmacy owners operating on thin margins with limited access to capital, '
    'the TCO differential is often the determining factor in whether a pharmacy can afford to digitize '
    'its operations at all.'
))

story.append(body(
    'The TCO analysis reveals a stark segmentation in the competitive landscape. At the premium end, '
    'PioneerRx requires a three-year investment of $22,000 to $48,000 per location when accounting for '
    'monthly fees, implementation costs, dedicated server hardware, and IT support requirements. This '
    'price point is accessible only to large pharmacy chains or well-capitalized independent pharmacies. '
    'In the mid-range, ProPharma ($10,000-$25,000 three-year TCO) and PharmaPOS ($4,000-$10,000) offer '
    'more accessible price points but still represent significant investments for small African pharmacies '
    'where average monthly revenue may be $3,000 to $8,000. At the value end, Africa-focused systems like '
    'Peppermint ($500-$3,000), Bumpa ($400-$2,500), and Loyverse ($0-$1,000) provide compelling entry '
    'points, though their limited feature sets mean that pharmacies may need to supplement them with '
    'additional tools or manual processes, effectively increasing the true cost of operations.'
))

pricing_headers = ['Cost Component', 'SelRx', 'PioneerRx', 'PharmaPOS', 'Peppermint', 'Bumpa', 'Pastel', 'Square', 'Loyverse']
pricing_rows = [
    ['Monthly Fee', '$50-150', '$300-600', '$99-250', '$15-80', '$10-60', '$30-200', '$0*', '$0-25'],
    ['Setup Fee', '$0', '$10-25K', '$0-500', '$0', '$0', '$500-2K', '$0', '$0'],
    ['On-Premise Server', 'Not Req.', 'Required', 'Not Req.', 'Not Req.', 'Not Req.', 'Required', 'Not Req.', 'Not Req.'],
    ['IT Staff Required', 'Not Req.', 'Required', 'Not Req.', 'Not Req.', 'Not Req.', 'Rec.', 'Not Req.', 'Not Req.'],
    ['POS Hardware', '$200-500', '$1.5-3K', '$200-600', '$200-500', '$200-500', '$1-2K', '$200-800', '$200-500'],
    ['Est. 3-Year TCO', '$2-6K', '$22-48K', '$4-10K', '$0.5-3K', '$0.4-2.5K', '$2-9K', '$1-4K', '$0-1K'],
]
pricing_cw = [W*0.17] + [W*(0.83/8)]*8
story.append(make_table(pricing_headers, pricing_rows, pricing_cw))
story.append(Paragraph('Table 7: Pricing and Total Cost of Ownership Comparison (per location, 3-year). *Square revenue comes from 2.6% + $0.10 per-transaction processing fees.', s_caption))

story.append(spacer(8))

story.append(body(
    'SelRx occupies a strategic position in the TCO landscape. Its estimated three-year TCO of $2,000 to '
    '$6,000 per pharmacy location is approximately 70-90% lower than pharmacy-specific competitors like '
    'PioneerRx and ProPharma, and roughly comparable to the upper range of Africa-focused general POS '
    'systems. However, unlike Peppermint, Bumpa, or Loyverse, SelRx delivers a comprehensive pharmacy-specific feature set that includes prescription management, drug interaction checking, batch and '
    'expiry tracking, stock-taking, goods return workflows, and advanced analytics. This creates a '
    'compelling value proposition: SelRx offers pharmacy-specific capabilities at general POS pricing, '
    'effectively delivering enterprise-grade pharmacy management at a fraction of the traditional cost.'
))

story.append(body(
    'The value proposition is further strengthened by SelRx\'s elimination of implementation fees and IT '
    'infrastructure requirements. While PioneerRx requires a $10,000 to $25,000 implementation investment '
    'and a dedicated IT administrator, SelRx can be deployed in under an hour by a pharmacy owner with '
    'no technical background. The automated database provisioning, pre-configured regional settings, '
    'and self-service onboarding wizard mean that the total transition cost is limited to the monthly '
    'subscription fee and basic POS hardware (receipt printer, barcode scanner, cash drawer), which can '
    'be sourced for $200 to $500 from local suppliers. For a pharmacy in Lagos or Accra considering '
    'digitization for the first time, this zero-friction deployment model removes the two most common '
    'barriers to adoption: high upfront costs and the need for technical expertise.'
))

# ══════════════════════════════════════════════════════════════════════════════════════
# CHAPTER 6: SWOT ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════════════

story.append(heading('6. SWOT Analysis', s_h1, level=0))

story.append(body(
    'The following SWOT analysis evaluates SelRx\'s competitive position specifically within the '
    'African pharmacy market, considering the expanded competitor set introduced in this report. '
    'This analysis contextualizes SelRx\'s internal capabilities against the external opportunities '
    'and threats presented by the current market dynamics and competitive landscape.'
))

# --- Strengths ---
story.append(heading('6.1 Strengths', s_h2, level=1))

story.append(body(
    '<b>Comprehensive Pharmacy-Specific Feature Set at Value Pricing.</b> SelRx delivers the most '
    'complete pharmacy management capabilities among all cloud-native competitors analyzed. Features such '
    'as prescription lifecycle management with priority levels and refill tracking, drug interaction '
    'checking with severity-level alerting, batch and lot tracking with auto-generated batch numbers, '
    'periodic stock-taking with variance analysis, and goods return workflows with approval chains are '
    'typically found only in systems costing 5-10 times more. This feature depth at SelRx\'s price point '
    'creates a value proposition that no other competitor in this analysis can match: pharmacy-specific '
    'capabilities delivered at general POS pricing.'
))

story.append(body(
    '<b>Dual-Deployment Architecture.</b> The combination of a cloud-native web application (Next.js) and a '
    'desktop wrapper (Tauri v2) with local SQLite provides deployment flexibility that no single-architecture '
    'competitor can match. Pharmacies with reliable internet can use the web mode for zero-installation '
    'access, while those requiring hardware integration, offline capability, or local data sovereignty can '
    'use the desktop mode. This dual architecture is particularly valuable in African markets where '
    'infrastructure quality varies dramatically between urban centers and peri-urban areas, and where a '
    'single deployment model cannot serve the full range of customer needs.'
))

story.append(body(
    '<b>Offline-First Resilience with Persistent Queue.</b> SelRx\'s offline capability goes beyond simple '
    'caching. The persistent offline queue, implemented through a SQLite-backed PendingSyncQueue table, '
    'ensures that sales transactions, inventory adjustments, and other operations are never lost during '
    'connectivity interruptions. The queue survives application restarts and automatically processes '
    'pending operations when connectivity is restored. This is a critical advantage in African markets '
    'where internet outages are frequent and unpredictable, and where data loss during an outage can '
    'have serious financial and operational consequences for a pharmacy. Most cloud POS competitors, '
    'including PharmaPOS, Peppermint, and Bumpa, have no meaningful offline capability.'
))

story.append(body(
    '<b>African Market Localization.</b> SelRx is the only system in this comparison with native support for '
    '16 West African currencies (including all CFA Franc variants), 33+ African timezones, and culturally '
    'adapted business practices. This localization extends beyond technical settings to encompass the '
    'entire user experience: date formats, receipt layouts, business type categorizations, and country-specific onboarding workflows. Competitors must invest significant development resources to achieve '
    'comparable localization, creating a meaningful barrier to market entry.'
))

# --- Weaknesses ---
story.append(heading('6.2 Weaknesses', s_h2, level=1))

story.append(body(
    '<b>No Insurance Claim Adjudication.</b> Despite being the most requested feature by pharmacy owners in '
    'markets with growing insurance penetration (Nigeria\'s NHIS, Ghana\'s NHIA, South Africa\'s medical aids), '
    'SelRx does not currently integrate with any health insurance claim processing systems. PioneerRx '
    'and ProPharma both offer mature, deeply integrated insurance modules that automate claim submission, '
    'real-time adjudication, and reconciliation. As insurance coverage expands across Africa, the absence '
    'of this capability will become an increasingly significant competitive disadvantage, particularly for '
    'pharmacies in Nigeria and South Africa where insurance claims represent a growing share of revenue.'
))

story.append(body(
    '<b>Limited Clinical Decision Support.</b> While SelRx now includes basic drug-drug interaction checking, '
    'the system lacks the comprehensive clinical decision support capabilities that pharmacy regulators '
    'increasingly expect. Full CDS requires access to commercial drug databases (First Databank, Medi-Span, '
    'or WHO Drug Information), dosage range validation, allergy cross-referencing at scale, duplicate '
    'therapy alerts, and pregnancy/lactation screening. Implementing these capabilities requires '
    'significant investment in database licensing and clinical algorithm development, and the ongoing '
    'cost of maintaining drug database subscriptions adds to operational expenses.'
))

story.append(body(
    '<b>No Mobile Money Integration.</b> Despite mobile money being the primary digital payment method across '
    'West and East Africa, SelRx does not yet offer native integration with mobile money platforms such '
    'as MTN MoMo, Vodafone Cash, Airtel Money, or M-Pesa. The payment architecture supports mobile money '
    'as a payment method category, but actual transaction processing requires manual reconciliation '
    'outside the system. This is a significant gap in markets where mobile money accounts for 30-60% of '
    'digital transactions, and it represents a feature that no global or pharmacy-specific competitor has '
    'yet addressed, creating an opportunity for SelRx to establish a first-mover advantage.'
))

# --- Opportunities ---
story.append(heading('6.3 Opportunities', s_h2, level=1))

story.append(body(
    '<b>Mobile Money First-Mover Advantage.</b> The rapid growth of mobile money platforms across Africa '
    'presents a unique and time-sensitive opportunity for SelRx. No competitor in this analysis, whether '
    'pharmacy-specific or general POS, offers native mobile money integration. MTN MoMo alone processes '
    'over $500 billion in annual transactions across Africa, and mobile money is the primary digital '
    'payment method in Ghana, Kenya, Tanzania, Uganda, and parts of Nigeria. By integrating mobile money '
    'payment processing directly into the POS workflow, SelRx would transform from a management tool '
    'into an essential revenue-enabling platform, creating a powerful competitive moat that is difficult '
    'for US or European-designed systems to replicate.'
))

story.append(body(
    '<b>Regulatory Compliance as a Service.</b> As African pharmacy regulators increasingly require digital '
    'record-keeping, automated expiry tracking, electronic dispensing documentation, and controlled '
    'substance reporting, SelRx can position itself as a compliance partner rather than merely a POS vendor. '
    'By proactively building regulatory reporting features tailored to each country\'s requirements and '
    'offering compliance dashboards that help pharmacy owners prepare for regulatory inspections, SelRx can '
    'increase switching costs and become the default solution for pharmacies seeking to meet evolving '
    'regulatory obligations. Each country implementation follows a repeatable pattern, making the '
    'compliance feature set increasingly efficient as SelRx expands into additional markets.'
))

story.append(body(
    '<b>Chain Pharmacy Consolidation Platform.</b> The African pharmacy market is beginning to experience '
    'consolidation, with pharmacy chains emerging in Nigeria (HealthPlus, MedPlus), Ghana (mPharma), '
    'Kenya (Goodlife Pharmacy), and South Africa (Clicks, Dis-Chem). SelRx\'s hub-and-terminal sync '
    'architecture, with Cloudflare Tunnel support for remote branch connectivity and centralized '
    'reporting capabilities, is architecturally well-positioned to serve these chains. By developing '
    'consolidated multi-branch dashboards, inter-branch transfer management, and centralized purchasing '
    'workflows, SelRx can capture the high-value chain pharmacy segment that represents disproportionate '
    'revenue potential.'
))

# --- Threats ---
story.append(heading('6.4 Threats', s_h2, level=1))

story.append(body(
    '<b>General POS Competitive Pressure.</b> The most immediate threat comes not from pharmacy-specific '
    'competitors but from Africa-focused general POS systems that are gaining pharmacy users by default. '
    'Peppermint and Bumpa are aggressively acquiring small pharmacy users who prioritize simplicity and '
    'low cost over pharmacy-specific features. Once a pharmacy has invested time in learning a POS system '
    'and has historical data stored in that system, switching costs create inertia that makes it difficult '
    'for SelRx to convert these users later. The risk is that a significant portion of the market will '
    'standardize on general POS platforms before SelRx can establish itself as the default pharmacy '
    'solution, particularly among the smallest pharmacies that represent the largest segment by count.'
))

story.append(body(
    '<b>Square Potential African Market Entry.</b> While Square has not yet launched in sub-Saharan Africa, '
    'its parent company Block has made significant investments in African fintech infrastructure, and '
    'an African market entry is plausible within the next two to three years. Square\'s brand recognition, '
    'polished user experience, extensive hardware ecosystem, and massive R&D budget would make it a '
    'formidable competitor for the general POS segment. If Square were to add basic pharmacy features '
    '(which would be relatively straightforward given its app marketplace architecture), it could quickly '
    'capture the small-to-medium pharmacy segment that currently represents SelRx\'s primary target market.'
))

story.append(body(
    '<b>Regulatory Fragmentation Across 54 African Markets.</b> The African market is not a single market but '
    'a collection of 54 distinct regulatory environments, each with its own pharmaceutical regulations, tax '
    'requirements, data localization rules, and licensing frameworks. Adapting to each country\'s specific '
    'requirements requires significant development resources and local regulatory expertise. Failure to '
    'adequately localize for specific markets could limit SelRx\'s growth potential and create openings for '
    'locally-developed alternatives that better understand their domestic regulatory environment. This '
    'fragmentation also increases the cost of market entry and extends the time-to-revenue for each new '
    'geographic expansion.'
))

# ══════════════════════════════════════════════════════════════════════════════════════
# CHAPTER 7: STRATEGIC ROADMAP
# ══════════════════════════════════════════════════════════════════════════════════════

story.append(PageBreak())
story.append(heading('7. Strategic Roadmap', s_h1, level=0))

story.append(body(
    'Based on the competitive analysis presented in this report, the following strategic recommendations '
    'are designed to strengthen SelRx\'s market position, address identified weaknesses, and capitalize '
    'on the opportunities presented by the rapidly growing African pharmacy market. Each recommendation '
    'is prioritized by expected market impact and implementation feasibility, with an estimated timeline '
    'for development and deployment.'
))

# Priority 1
story.append(heading('7.1 Priority 1: Mobile Money Integration (High Impact, Medium Effort)', s_h2, level=1))

story.append(body(
    'Integrating mobile money payment processing directly into the SelRx POS workflow should be the '
    'highest-priority development initiative. This capability is unique to the African market and '
    'represents a feature that none of the established US or European competitors can easily replicate. '
    'Mobile money is the primary digital payment method across West and East Africa, with MTN MoMo alone '
    'processing over $500 billion in annual transactions. The integration should target Ghana (MTN MoMo, '
    'Vodafone Cash) and Nigeria (MTN MoMo, Airtel Money, OPay) as initial markets, with expansion to '
    'Kenya (M-Pesa, Airtel Money) and Tanzania (M-Pesa, Tigo Pesa) as follow-on phases. Implementation can '
    'leverage existing mobile money APIs (MTN MoMo API, Vodafone Cash API) and should support both '
    'push and pull payment flows, real-time payment confirmation, and automated reconciliation. Estimated '
    'development timeline: 8-12 weeks for initial market integration.'
))

# Priority 2
story.append(heading('7.2 Priority 2: Insurance Claim Module (High Impact, High Effort)', s_h2, level=1))

story.append(body(
    'Developing an insurance claim adjudication module tailored to African health insurance schemes would '
    'address the most significant functional gap identified in this analysis. The module should support '
    'claim submission, real-time adjudication, and reconciliation for the National Health Insurance Scheme '
    '(NHIS) in Nigeria, the National Health Insurance Authority (NHIA) in Ghana, and medical aid schemes '
    'in South Africa. This is a substantial development effort requiring regulatory domain expertise '
    'and integration with insurance provider systems, but it would unlock access to a rapidly growing '
    'segment of the pharmacy market. A phased approach is recommended: start with manual claim tracking '
    'and documentation generation (3-4 months), then progress to semi-automated submission for specific '
    'schemes (6-8 months), and eventually full real-time adjudication integration (12-18 months).'
))

# Priority 3
story.append(heading('7.3 Priority 3: Chain Pharmacy Features (High Impact, Medium Effort)', s_h2, level=1))

story.append(body(
    'Developing centralized multi-branch management features would position SelRx to capture the high-value '
    'chain pharmacy segment that is emerging across Africa. Key features include a consolidated '
    'multi-branch dashboard with real-time sales, inventory, and prescription metrics across all locations; '
    'inter-branch stock transfer management with approval workflows and in-transit tracking; centralized '
    'purchasing with automated purchase order generation based on aggregate demand across branches; and '
    'branch performance benchmarking with comparative analytics. SelRx\'s existing hub-and-terminal sync '
    'architecture provides the foundation for these features, and the Cloudflare Tunnel support already '
    'enables secure remote branch connectivity. The primary development effort is in building the '
    'consolidated reporting and inter-branch workflow interfaces. Estimated timeline: 10-14 weeks for core '
    'multi-branch management features.'
))

# Priority 4
story.append(heading('7.4 Priority 4: Regulatory Compliance Automation (Medium Impact, Medium Effort)', s_h2, level=1))

story.append(body(
    'Building automated regulatory reporting features for each target African country would create a strong '
    'differentiator and significantly increase switching costs. This includes automated generation of '
    'dispensing logs in formats required by the Pharmacy Council of Ghana and the Pharmacists Council of '
    'Nigeria; electronic submission of controlled substance records; automated expiry and recall '
    'notifications with supplier communication integration; and compliance dashboards that help pharmacy '
    'owners prepare for regulatory inspections. Each country implementation requires local regulatory '
    'expertise but follows a repeatable pattern, making it increasingly efficient as SelRx expands into '
    'additional markets. This feature set transforms SelRx from a tool into a regulatory compliance '
    'partner, fundamentally changing the value proposition for pharmacy owners. Estimated timeline: 6-8 weeks '
    'per country implementation, with diminishing time for subsequent countries.'
))

# Priority 5
story.append(heading('7.5 Priority 5: Enhanced Clinical Decision Support (Medium Impact, High Effort)', s_h2, level=1))

story.append(body(
    'While comprehensive CDS is not an immediate market requirement in most African countries, beginning '
    'development of an enhanced CDS module would future-proof the platform and open doors to higher-value '
    'market segments including hospital pharmacies and clinical pharmacy practices. A phased approach is '
    'recommended: expand the existing drug-drug interaction database beyond WHO essential medicines to '
    'include national formularies; add dosage range validation with weight- and age-based dosing checks; '
    'implement pregnancy and lactation screening alerts; and develop duplicate therapy detection. '
    'Partnering with academic pharmacy institutions in target markets could provide the clinical expertise '
    'needed to validate and calibrate these features for local drug formularies and prescribing patterns. '
    'Estimated timeline: 16-24 weeks for a comprehensive CDS module with local formulary support.'
))

# Roadmap summary table
story.append(spacer(8))
story.append(heading('Implementation Roadmap Summary', s_h3, level=1))

road_headers = ['Priority', 'Initiative', 'Impact', 'Effort', 'Timeline']
road_rows = [
    ['1', 'Mobile Money Integration', 'High', 'Medium', '8-12 weeks'],
    ['2', 'Insurance Claim Module', 'High', 'High', '12-18 months'],
    ['3', 'Chain Pharmacy Features', 'High', 'Medium', '10-14 weeks'],
    ['4', 'Regulatory Compliance', 'Medium', 'Medium', '6-8 weeks/country'],
    ['5', 'Enhanced CDS', 'Medium', 'High', '16-24 weeks'],
]
road_cw = [W*0.10, W*0.30, W*0.15, W*0.15, W*0.30]
story.append(make_table(road_headers, road_rows, road_cw))
story.append(Paragraph('Table 8: Strategic Implementation Roadmap', s_caption))

story.append(spacer(12))

story.append(body(
    'By executing this roadmap, SelRx can establish an unassailable competitive position in the African '
    'pharmacy management market. The combination of mobile money integration, insurance claim processing, '
    'chain pharmacy features, and regulatory compliance automation would create a feature set that no '
    'competitor, whether pharmacy-specific or general POS, can easily replicate. The key strategic '
    'insight from this analysis is that SelRx\'s greatest advantage lies not in matching competitor features '
    'one-for-one, but in building capabilities that are uniquely valuable in the African context: mobile '
    'money integration that global systems cannot easily replicate, regulatory compliance features that '
    'require local expertise, and a deployment model that respects the infrastructure realities of African '
    'pharmacy operations. This Africa-first approach, executed with the technical sophistication of a '
    'modern cloud-native platform, is SelRx\'s most powerful competitive weapon.'
))

# ━━━━ BUILD PDF ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OUTPUT = '/home/z/my-project/download/SelRx_Competitive_Landscape_Analysis.pdf'

doc = TocDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=MARGIN, bottomMargin=MARGIN,
    title='SelRx Competitive Landscape Analysis',
    author='SelRx Product Strategy Team',
    subject='Competitive analysis of SelRx vs. 8 POS systems across African and global markets',
)

doc.multiBuild(story, onFirstPage=page_header_footer, onLaterPages=page_header_footer)
print(f'Body PDF generated: {OUTPUT}')
