import re, html
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
src = open('/home/user/Mauritus-life/docs/REPORT.md', encoding='utf8').read()
def clean(t):
    t = t.replace('—','-').replace('–','-').replace('’',"'").replace('“','"').replace('”','"')
    return t.encode('latin-1','replace').decode('latin-1')
def inline(t):
    t = html.escape(clean(t), quote=False)
    t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
    t = re.sub(r'`(.+?)`', r'<font face="Courier" size="8.5">\1</font>', t)
    t = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<i>\1</i>', t)
    return t
ss = getSampleStyleSheet()
INK = colors.HexColor('#14323d'); TEAL = colors.HexColor('#0f7a8a')
body = ParagraphStyle('b', parent=ss['Normal'], fontName='Helvetica', fontSize=9.6, leading=13.4, textColor=colors.HexColor('#222222'), spaceAfter=4)
h1 = ParagraphStyle('h1', parent=ss['Heading1'], fontName='Helvetica-Bold', fontSize=15, leading=19, textColor=INK, spaceBefore=14, spaceAfter=6)
h2 = ParagraphStyle('h2', parent=ss['Heading2'], fontName='Helvetica-Bold', fontSize=11.5, leading=15, textColor=TEAL, spaceBefore=9, spaceAfter=4)
title = ParagraphStyle('t', parent=ss['Title'], fontName='Helvetica-Bold', fontSize=24, leading=29, textColor=INK, alignment=0, spaceAfter=6)
sub = ParagraphStyle('s', parent=body, fontSize=11, leading=15, textColor=colors.HexColor('#555555'))
bul = ParagraphStyle('bl', parent=body, leftIndent=14, bulletIndent=3, spaceAfter=2.5)
num = ParagraphStyle('nm', parent=bul, leftIndent=18)
cell = ParagraphStyle('c', parent=body, fontSize=8.6, leading=11, spaceAfter=0)
cellh = ParagraphStyle('ch', parent=cell, fontName='Helvetica-Bold', textColor=colors.white)
W = A4[0] - 36*mm
story = []
lines = src.split('\n'); i = 0; first = True
def flush_table(rows):
    rows = [r for r in rows if not re.match(r'^\|\s*[-: |]+\|?\s*$', r)]
    data = [[c.strip() for c in r.strip().strip('|').split('|')] for r in rows]
    n = max(len(r) for r in data)
    data = [r + ['']*(n-len(r)) for r in data]
    tbl = [[Paragraph(inline(c), cellh if ri == 0 else cell) for c in r] for ri, r in enumerate(data)]
    widths = None
    if n == 2: widths = [W*0.26, W*0.74]
    elif n == 4: widths = [W*0.1, W*0.3, W*0.3, W*0.3]
    t = Table(tbl, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),INK),('VALIGN',(0,0),(-1,-1),'TOP'),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, colors.HexColor('#eef5f6')]),('GRID',(0,0),(-1,-1),0.4,colors.HexColor('#c9d6d9')),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3)]))
    story.append(t); story.append(Spacer(1, 6))
while i < len(lines):
    ln = lines[i]
    if ln.startswith('# '):
        story.append(Spacer(1, 40)); story.append(Paragraph(inline(ln[2:]), title)); story.append(HRFlowable(width='100%', thickness=2, color=TEAL, spaceAfter=8))
    elif ln.startswith('## '):
        story.append(Paragraph(inline(ln[3:]), h1)); story.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#c9d6d9'), spaceAfter=4))
    elif ln.startswith('### '):
        story.append(Paragraph(inline(ln[4:]), h2))
    elif ln.strip() == '---':
        pass
    elif ln.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].startswith('|'): rows.append(lines[i]); i += 1
        flush_table(rows); continue
    elif re.match(r'^\s*- ', ln):
        story.append(Paragraph(inline(re.sub(r'^\s*- ', '', ln)), bul, bulletText='•'))
    elif re.match(r'^\d+\. ', ln):
        m = re.match(r'^(\d+)\. (.*)', ln); story.append(Paragraph(inline(m.group(2)), num, bulletText=m.group(1)+'.'))
    elif ln.strip():
        st = sub if first else body
        if first: first = False
        story.append(Paragraph(inline(ln), st))
    i += 1
def foot(c, d):
    c.saveState(); c.setFont('Helvetica', 8); c.setFillColor(colors.HexColor('#777777'))
    c.drawString(18*mm, 10*mm, 'Mauritius Life - how the game works'); c.drawRightString(A4[0]-18*mm, 10*mm, 'Page %d' % d.page); c.restoreState()
doc = SimpleDocTemplate('/home/user/Mauritus-life/docs/REPORT.pdf', pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=18*mm, title='Mauritius Life: how the game works', author='Mauritius Life')
doc.build(story, onFirstPage=foot, onLaterPages=foot)
