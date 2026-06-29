import { test, expect } from '@playwright/test';

test('采购单审核邮件通知测试', async ({ page }) => {
  // 登录
  await page.goto('http://43.160.199.226');
  await page.fill('input[type="email"]', 'admin@oms.com');
  await page.fill('input[type="password"]', 'Make$45617');
  await page.click('button[type="submit"]');
  
  // 等待登录完成
  await page.waitForURL('**/dashboard');
  
  // 进入公司设置页面
  await page.click('text=公司設定');
  await page.waitForTimeout(1000);
  
  // 设置通知邮箱
  const emailInput = page.locator('input[name="notification_email"]').first();
  await emailInput.fill('wxfaigl@gmail.com');
  await page.click('text=保存');
  await page.waitForTimeout(1000);
  
  // 进入采购单页面
  await page.click('text=採購單');
  await page.waitForTimeout(1000);
  
  // 创建新采购单
  await page.click('text=新建採購單');
  await page.waitForTimeout(1000);
  
  // 填写采购单基本信息
  await page.fill('input[name="supplier_id"]', '1');
  await page.fill('input[name="po_date"]', '2026-06-26');
  
  // 添加采购单项目
  await page.click('text=添加項目');
  await page.waitForTimeout(500);
  
  // 填写项目信息
  await page.fill('input[name="material_id"]', '1');
  await page.fill('input[name="quantity"]', '10');
  await page.fill('input[name="unit_price"]', '100');
  
  // 保存采购单
  await page.click('text=保存');
  await page.waitForTimeout(2000);
  
  // 提交审核
  await page.click('text=提交審核');
  await page.waitForTimeout(2000);
  
  // 验证状态变为待审核
  const status = await page.locator('.status').textContent();
  expect(status).toContain('待審核');
  
  // 等待邮件发送
  await page.waitForTimeout(5000);
  
  console.log('采购单已提交审核，请检查 wxfaigl@gmail.com 是否收到邮件');
});
