#!/usr/bin/env python3
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import getSampleStyleSheet
import os, sys

# ── 字体：尝试系统中文字体 ───────────────────────────────────
FONT_PATHS = [
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/Library/Fonts/Arial Unicode MS.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode MS.ttf",
]
FONT_NAME = "Helvetica"  # fallback
for fp in FONT_PATHS:
    if os.path.exists(fp):
        try:
            pdfmetrics.registerFont(TTFont("CJK", fp))
            FONT_NAME = "CJK"
            break
        except Exception:
            continue

W, H = A4
BLUE    = HexColor("#1B3A6B")
ACCENT  = HexColor("#2563EB")
LIGHT   = HexColor("#F0F4FF")
GRAY    = HexColor("#6B7280")
LGRAY   = HexColor("#E5E7EB")
GREEN   = HexColor("#16A34A")
BG      = HexColor("#F8FAFC")

def font(c, size, bold=False):
    c.setFont(FONT_NAME, size)

def page1(c):
    """封面页"""
    # 深蓝顶部色块
    c.setFillColor(BLUE)
    c.rect(0, H - 80*mm, W, 80*mm, fill=1, stroke=0)

    # 公司名称
    font(c, 11)
    c.setFillColor(HexColor("#90B8F8"))
    c.drawString(20*mm, H - 20*mm, "FAN YONG CO., LTD")

    # 主标题
    c.setFillColor(white)
    font(c, 26)
    c.drawString(20*mm, H - 38*mm, "OMS 订单管理系统")
    font(c, 14)
    c.drawString(20*mm, H - 50*mm, "系统维护报告")

    # 副标题
    font(c, 10)
    c.setFillColor(HexColor("#93C5FD"))
    c.drawString(20*mm, H - 62*mm, "2026 年 3 月 16 日  —  2026 年 6 月 15 日（近三个月）")

    # 浅灰大背景
    c.setFillColor(BG)
    c.rect(0, 0, W, H - 80*mm, fill=1, stroke=0)

    # KPI 三格
    panels = [
        ("349", "本季度迭代次数"),
        ("12", "已修复缺陷"),
        ("13/13", "E2E 测试通过"),
    ]
    pw = (W - 40*mm) / 3
    for i, (val, label) in enumerate(panels):
        x = 20*mm + i * pw
        y = H - 80*mm - 42*mm
        c.setFillColor(white)
        c.roundRect(x + 2*mm, y, pw - 4*mm, 32*mm, 4*mm, fill=1, stroke=0)
        c.setFillColor(ACCENT)
        font(c, 20)
        c.drawCentredString(x + pw/2, y + 18*mm, val)
        c.setFillColor(GRAY)
        font(c, 9)
        c.drawCentredString(x + pw/2, y + 8*mm, label)

    # 摘要说明
    c.setFillColor(GRAY)
    font(c, 9)
    summary = [
        "本报告覆盖 OMS 系统近三个月的维护与迭代工作，包含功能交付、",
        "缺陷修复、自动化测试及系统运维等方面的进展摘要，供客户参考。",
    ]
    ty = H - 80*mm - 58*mm
    for line in summary:
        c.drawString(20*mm, ty, line)
        ty -= 5*mm

    # 底部
    c.setFillColor(LGRAY)
    c.rect(0, 0, W, 12*mm, fill=1, stroke=0)
    c.setFillColor(GRAY)
    font(c, 8)
    c.drawString(20*mm, 4*mm, "报告日期：2026年6月15日")
    c.drawRightString(W - 20*mm, 4*mm, "第 1 页")

def draw_section_title(c, y, title):
    c.setFillColor(ACCENT)
    c.rect(20*mm, y - 1*mm, 3*mm, 7*mm, fill=1, stroke=0)
    c.setFillColor(BLUE)
    font(c, 12)
    c.drawString(25*mm, y, title)
    return y - 10*mm

def draw_table(c, y, headers, rows, col_widths):
    x0 = 20*mm
    row_h = 7.5*mm
    header_h = 8*mm

    # 表头
    c.setFillColor(BLUE)
    c.rect(x0, y - header_h, sum(col_widths), header_h, fill=1, stroke=0)
    c.setFillColor(white)
    font(c, 8)
    xx = x0
    for h, w in zip(headers, col_widths):
        c.drawString(xx + 2*mm, y - header_h + 2.5*mm, h)
        xx += w
    y -= header_h

    # 行
    for ri, row in enumerate(rows):
        bg = LIGHT if ri % 2 == 0 else white
        c.setFillColor(bg)
        c.rect(x0, y - row_h, sum(col_widths), row_h, fill=1, stroke=0)
        # 行边框
        c.setStrokeColor(LGRAY)
        c.setLineWidth(0.3)
        c.line(x0, y - row_h, x0 + sum(col_widths), y - row_h)
        xx = x0
        c.setFillColor(black)
        font(c, 8)
        for cell, w in zip(row, col_widths):
            if cell.startswith("✅"):
                c.setFillColor(GREEN)
                c.drawString(xx + 2*mm, y - row_h + 2.2*mm, cell)
                c.setFillColor(black)
            else:
                c.drawString(xx + 2*mm, y - row_h + 2.2*mm, cell)
            xx += w
        y -= row_h

    # 外框
    c.setStrokeColor(LGRAY)
    c.setLineWidth(0.5)
    c.rect(x0, y, sum(col_widths), header_h + row_h * len(rows), stroke=1, fill=0)
    return y - 6*mm

def footer(c, page_num, total):
    c.setFillColor(LGRAY)
    c.rect(0, 0, W, 12*mm, fill=1, stroke=0)
    c.setFillColor(GRAY)
    font(c, 8)
    c.drawString(20*mm, 4*mm, "FAN YONG CO., LTD  ·  OMS 维护报告  ·  2026 Q2")
    c.drawRightString(W - 20*mm, 4*mm, f"第 {page_num} 页 / 共 {total} 页")

def page2(c):
    """功能交付"""
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    y = H - 20*mm
    c.setFillColor(BLUE)
    font(c, 14)
    c.drawString(20*mm, y, "一、功能交付")
    y -= 14*mm

    y = draw_section_title(c, y, "1.1  业务核心模块升级")
    headers = ["模块", "主要改动"]
    rows = [
        ["客户订单", "状态手动标记 / 全屏编辑 / BOM 下拉搜索 / 自动创建草稿出货单"],
        ["BOM 物料",  "图片上传 / MOQ 阶梯价 / 认证机构 / 品牌栏 / 点击展开明细"],
        ["采购单",    "整合收货功能 / 可搜索供应商 / 手动单据编号 / 自动带入料号"],
        ["出货单",    "基于客户订单重构 / 列表页直接操作 / 出货数量联动追踪"],
        ["生产单",    "完整状态流程 draft→completed / 自动库存缺料检查"],
        ["报价单",    "MOQ 阶梯价 / 手动报价编号 / 优化默认备注"],
    ]
    y = draw_table(c, y, headers, rows, [35*mm, W - 55*mm])
    y -= 3*mm

    y = draw_section_title(c, y, "1.2  打印功能完善")
    rows2 = [
        ["客户订单打印", "新增币种、税率/税额、含税合计、交货日、负责人等字段"],
        ["出货单打印",   "标准列（品名/料号/规格/数量/单位/单价/金额）重排版"],
        ["统一签章管理", "所有单据自动读取公司设置，签章尺寸可配置，草稿不显示签章"],
    ]
    y = draw_table(c, y, ["单据", "改动说明"], rows2, [40*mm, W - 60*mm])
    y -= 3*mm

    y = draw_section_title(c, y, "1.3  用户体验提升")
    bullets = [
        "全局可搜索下拉框（BOM / 客户 / 供应商），弹出方向智能判断防遮挡",
        "所有长列表表格支持纵向滚动悬浮表头，宽表格支持横向滚动与冻结列",
        "统一 StatusFlow 状态 UI 组件，全系统状态徽章与操作按钮风格一致",
        "全部状态变更 / 删除操作前统一弹出确认对话框，防止误操作",
        "全局 Toast 通知替换原有 confirm() 弹窗，错误置顶 / 成功置底",
    ]
    for b in bullets:
        c.setFillColor(ACCENT)
        c.circle(21.5*mm, y + 2*mm, 1*mm, fill=1, stroke=0)
        c.setFillColor(HexColor("#374151"))
        font(c, 8.5)
        c.drawString(24*mm, y, b)
        y -= 6*mm

    footer(c, 2, 3)

def page3(c):
    """缺陷修复 + 测试 + 运维 + 建议"""
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    y = H - 20*mm
    c.setFillColor(BLUE)
    font(c, 14)
    c.drawString(20*mm, y, "二、缺陷修复 / 三、自动化测试 / 四、运维与建议")
    y -= 14*mm

    y = draw_section_title(c, y, "2.  缺陷修复（本季度共修复 12 项）")
    rows = [
        ["BOM 选择框被遮挡无法点击",            "✅ 已修复"],
        ["同一 BOM 多品项出货数量同步错误",      "✅ 已修复"],
        ["分页组件重复页码 / 超范围后无法翻页",   "✅ 已修复"],
        ["出货单创建 customer_name undefined",    "✅ 已修复"],
        ["库存 DECIMAL 字段精度计算偏差",         "✅ 已修复"],
        ["详情面板展开后持续显示「载入中」",      "✅ 已修复"],
        ["图片上传后 URL 路径错误（Nginx 代理）", "✅ 已修复"],
        ["多处 TypeScript 类型错误导致 Build 失败","✅ 已修复"],
        ["Nginx 代理 /api/ 路径转发失败",         "✅ 已修复"],
        ["每日巡检 SQL 因 schema 差异报错",       "✅ 已修复"],
        ["Modal 层叠时滚动容器互相干扰",          "✅ 已修复"],
        ["滚动桥接组件滚轮方向处理异常",          "✅ 已修复"],
    ]
    y = draw_table(c, y, ["缺陷描述", "状态"], rows, [W - 60*mm, 20*mm])
    y -= 3*mm

    y = draw_section_title(c, y, "3.  自动化测试")
    test_rows = [
        ["test-full-flow",        "完整业务流程（下单→采购→入库→出货）",  "通过"],
        ["test-prod-crud-sweep",  "生产环境全模块 CRUD 验证",              "通过"],
        ["test-po-print-layout",  "采购单打印布局",                        "通过"],
        ["test-quotation-crud",   "报价单创建/编辑/删除",                  "通过"],
        ["test-rbac",             "权限角色访问控制",                      "通过"],
    ]
    y = draw_table(c, y, ["测试套件", "覆盖范围", "结果"],
                   test_rows, [45*mm, W - 85*mm, 18*mm])
    y -= 3*mm

    y = draw_section_title(c, y, "4.  运维亮点")
    ops = [
        "每日 07:00 自动巡检：订单出货异常 / 缺料 / 负库存 / 流程卡顿 → Telegram 实时推送",
        "GitHub Actions CI/CD：代码合并即自动构建、部署、通知，全程无需人工干预",
        "公司信息统一配置：所有单据打印公司名称从系统设置读取，不再硬编码",
    ]
    for b in ops:
        c.setFillColor(ACCENT)
        c.circle(21.5*mm, y + 2*mm, 1*mm, fill=1, stroke=0)
        c.setFillColor(HexColor("#374151"))
        font(c, 8.5)
        c.drawString(24*mm, y, b)
        y -= 6*mm

    y -= 3*mm
    y = draw_section_title(c, y, "5.  下季度建议")
    suggest = [
        ("高", "应收/应付账款与订单自动核销关联"),
        ("高", "巡检报告新增「连续多天无出货订单」异常提醒"),
        ("中", "报表模块支持导出 Excel"),
        ("中", "库存预警阈值配置，低于设定值时 Telegram 推送"),
    ]
    for pri, text in suggest:
        color = HexColor("#DC2626") if pri == "高" else HexColor("#D97706")
        c.setFillColor(color)
        c.roundRect(20*mm, y - 1*mm, 10*mm, 6*mm, 1.5*mm, fill=1, stroke=0)
        c.setFillColor(white)
        font(c, 7)
        c.drawCentredString(25*mm, y + 1*mm, pri)
        c.setFillColor(HexColor("#374151"))
        font(c, 8.5)
        c.drawString(33*mm, y, text)
        y -= 7*mm

    footer(c, 3, 3)

# ── 生成 PDF ─────────────────────────────────────────────────
out = "/Users/leo_w/Workspace/codes/ern-projects/oms-instance-v2/OMS_维护报告_2026Q2.pdf"
c = canvas.Canvas(out, pagesize=A4)
c.setTitle("OMS 系统维护报告 2026 Q2")
c.setAuthor("FAN YONG CO., LTD")

page1(c); c.showPage()
page2(c); c.showPage()
page3(c); c.showPage()
c.save()
print(f"✅  PDF 已生成：{out}")
