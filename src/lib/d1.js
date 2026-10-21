let indexesInitialized = false;

/**
 * 自动迁移与索引初始化：
 * 1. 检查 idx_imginfo_url 索引是否已存在（仅扫描 sqlite_master 几行元数据）
 * 2. 若不存在（首次执行），自动重建已膨胀至 500MB 的 tgimglog 表并创建 url 索引，彻底释放存储空间并消除全表扫描
 */
export async function ensureD1Indexes(DB) {
  if (indexesInitialized || !DB) return;
  try {
    const existing = await DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_imginfo_url'"
    ).first();

    if (!existing) {
      await DB.batch([
        DB.prepare('DROP TABLE IF EXISTS tgimglog'),
        DB.prepare(
          'CREATE TABLE IF NOT EXISTS tgimglog (`id` integer PRIMARY KEY NOT NULL, `url` text, `referer` text, `ip` varchar(255), `time` DATE)'
        ),
        DB.prepare('CREATE INDEX IF NOT EXISTS idx_tgimglog_url ON tgimglog(url)'),
        DB.prepare('CREATE INDEX IF NOT EXISTS idx_imginfo_url ON imginfo(url)'),
      ]);
    }
    indexesInitialized = true;
  } catch (error) {
    // 若当前处于 D1 每日读取额度锁定状态，忽略错误，待 UTC 00:00（北京时间 08:00）重置后首次请求自动完成迁移
  }
}
