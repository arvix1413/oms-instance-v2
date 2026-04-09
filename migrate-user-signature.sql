-- 给users表添加signature_url字段，用于存储用户电子签名图片路径
ALTER TABLE users ADD COLUMN IF NOT EXISTS signature_url TEXT DEFAULT NULL;
