# ⚙️ 配置文件说明

## 📋 创建 .env 配置文件

### 步骤1：复制配置模板

**Windows**:
```bash
copy env-example.txt .env
```

**Linux/Mac**:
```bash
cp env-example.txt .env
```

### 步骤2：编辑配置文件

```bash
# Windows
notepad .env

# Linux/Mac
nano .env
```

---

## 🔑 必填配置

### Telegram 机器人配置

```env
# 从 @BotFather 获取（必填）
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz

# 从 @userinfobot 获取（必填）
TELEGRAM_CHAT_ID=123456789
```

**如何获取**：
1. **Bot Token**:
   - 打开 Telegram，搜索 `@BotFather`
   - 发送 `/newbot` 创建机器人
   - 复制得到的 Token

2. **Chat ID**:
   - 搜索 `@userinfobot`
   - 点击 START
   - 复制得到的 ID 数字

---

## 🎛️ 可选配置（推荐使用默认值）

### 1. 监控周期开关

```env
# 建议配置（已优化）
ENABLE_5M=false      # 5分钟 - 噪音多，关闭
ENABLE_15M=true      # 15分钟 - 短线突破
ENABLE_1H=true       # 1小时 - 趋势确认
ENABLE_4H=true       # 4小时 - 波段机会
ENABLE_1D=true       # 1天 - 中长期
```

### 2. 价格变动阈值

```env
# 建议值（已优化）
PRICE_THRESHOLD_15M=3.5    # 15分钟阈值
PRICE_THRESHOLD_1H=4.5     # 1小时阈值
PRICE_THRESHOLD_4H=5.5     # 4小时阈值
PRICE_THRESHOLD_1D=7.0     # 1天阈值
```

**说明**：
- 阈值越低，提醒越频繁
- 阈值越高，提醒越少但质量更高
- 默认值已优化平衡

### 3. 告警控制

```env
# 防止重复提醒
COOLDOWN_MINUTES=30        # 冷却时间（分钟）
MAX_ALERTS_PER_DAY=3       # 每日最大提醒次数
```

### 4. 量能分析

```env
VOLUME_MEDIAN_PERIODS=20   # 量能中位数计算周期
MIN_VOLUME_MULTIPLIER=1.0  # 最小量能倍数
```

### 5. API 请求

```env
CONCURRENCY_LIMIT=10       # 并发请求数（5-15）
```

**说明**：
- 值越大，扫描越快，但负载越高
- 建议 5-15 之间
- 国内网络建议用 5

---

## 🌐 代理配置（国内必需）

### 如果在国内使用

```env
# 取消注释并填写你的代理地址
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
```

**常见代理端口**：
- Clash: `7890`
- V2Ray: `1080` 或 `10808`
- SSR: `1080`

### 测试代理

```bash
# 设置代理后测试
npm run test-telegram
```

---

## 🐍 TA-Lib 配置（可选）

### 如果安装了 Python 微服务

```env
# 默认本地5000端口（可选填）
TALIB_SERVICE_URL=http://localhost:5000
```

**说明**：
- 如果不填，默认使用 `http://localhost:5000`
- 如果 Python 服务未运行，自动降级到基础形态
- 不影响主服务运行

---

## 📝 完整配置示例

```env
# Telegram 配置（必填）
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789

# 监控周期
ENABLE_5M=false
ENABLE_15M=true
ENABLE_1H=true
ENABLE_4H=true
ENABLE_1D=true

# 阈值配置
PRICE_THRESHOLD_15M=3.5
PRICE_THRESHOLD_1H=4.5
PRICE_THRESHOLD_4H=5.5
PRICE_THRESHOLD_1D=7.0

# 告警控制
COOLDOWN_MINUTES=30
MAX_ALERTS_PER_DAY=3

# 量能分析
VOLUME_MEDIAN_PERIODS=20
MIN_VOLUME_MULTIPLIER=1.0

# API 设置
CONCURRENCY_LIMIT=10

# 代理（国内需要）
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890

# 日志级别
LOG_LEVEL=info

# TA-Lib（可选）
# TALIB_SERVICE_URL=http://localhost:5000
```

---

## ✅ 验证配置

### 1. 测试 Telegram 连接

```bash
npm run test-telegram
```

**成功输出**：
```
📤 Sending test alert...
✅ Test alert sent. Check your Telegram.
```

### 2. 启动服务

```bash
npm start
# 或
pm2 start src/index.js --name smart-crypto-alert
```

### 3. 查看日志

```bash
pm2 logs smart-crypto-alert
```

**正常日志示例**：
```
[INFO] Enabled intervals: 15m, 1h, 4h, 1d
[INFO] Fetched 280 USDT perpetual symbols
[INFO] BTC Market: bullish | ADX: 28
[INFO] [15m] Scanning 280 symbols...
```

---

## ❓ 常见问题

### Q1: Telegram 收不到消息？

**检查**：
1. Token 和 Chat ID 是否正确（没有多余空格）
2. 是否已点击机器人的 START 按钮
3. 国内是否配置了代理

### Q2: 代理配置不生效？

**解决**：
1. 确认代理软件正在运行
2. 确认端口号正确
3. 使用 `http://` 而不是 `https://`
4. 重启服务：`pm2 restart smart-crypto-alert`

### Q3: 提醒太频繁？

**调整**：
1. 提高阈值：`PRICE_THRESHOLD_15M=5`
2. 关闭5分钟周期：`ENABLE_5M=false`
3. 降低冷却时间：`COOLDOWN_MINUTES=60`

### Q4: 提醒太少？

**调整**：
1. 降低阈值：`PRICE_THRESHOLD_15M=2.5`
2. 开启更多周期：`ENABLE_5M=true`
3. 降低量能倍数：`MIN_VOLUME_MULTIPLIER=0.8`

---

## 🔄 更新配置

修改 `.env` 文件后，需要重启服务：

```bash
pm2 restart smart-crypto-alert
```

---

## 📚 相关文档

- **README.md** - 项目介绍
- **DEPLOY.md** - 部署指南
- **env-example.txt** - 配置模板

---

**配置完成后，就可以开始使用了！** 🎉

