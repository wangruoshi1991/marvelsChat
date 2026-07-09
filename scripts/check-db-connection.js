#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import { Client } from 'pg';

console.log('检查数据库连接...');

const client = new Client({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
  user: process.env.POSTGRES_USER || 'miaoxun',
  password: process.env.POSTGRES_PASSWORD || 'miaoxun_dev',
  database: process.env.POSTGRES_DATABASE || 'marvels_chat',
});

async function checkConnection() {
  try {
    await client.connect();
    console.log('✓ 数据库连接成功');

    // 检查数据库版本
    const res = await client.query('SELECT version();');
    console.log('PostgreSQL版本:', res.rows[0].version);

    // 检查数据库大小
    const sizeRes = await client.query('SELECT pg_size_pretty(pg_database_size(current_database()));');
    console.log('数据库大小:', sizeRes.rows[0].pg_size_pretty);

    // 检查表数量
    const tableRes = await client.query(`
      SELECT COUNT(*) as table_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    console.log('表数量:', tableRes.rows[0].table_count);

    // 列出所有表
    const tablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('\n当前数据库中的表:');
    tablesRes.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    await client.end();
  } catch (error) {
    console.error('✗ 数据库连接失败:', error.message);
    console.error('\n可能的原因:');
    console.error('1. PostgreSQL服务未启动');
    console.error('2. 数据库信息不正确');
    console.error('3. 用户名或密码错误');
    console.error('4. 防火墙阻止了连接');

    console.error('\n请检查:');
    console.error('- PostgreSQL是否正在运行');
    console.error('- backend/.env文件中的配置是否正确');
    console.error('- 数据库是否已创建');
  }
}

checkConnection().catch(console.error);