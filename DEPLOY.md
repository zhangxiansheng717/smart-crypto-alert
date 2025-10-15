# 📦 完整部署指南

## 🚀 快速部署（服务器）

### 步骤1：准备环境

```bash
# SSH 连接到服务器
ssh your_user@your_server

# 安装 Node.js（如果还没有）
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 PM2
sudo npm install -g pm2

# 验证安装
node -v    # 应显示 v18.x.x
npm -v     # 应显示 9.x.x+
pm2 -v     # 应显示版本号
```

---

### 步骤2：上传项目到服务器

**方法A：使用 Git（推荐）**
```bash
cd /home/ubuntu/projects
git clone https://github.com/your-repo/smart-crypto-alert.git
cd smart-crypto-alert
```

**方法B：使用 SCP 上传**
```bash
# 在本地执行（Windows PowerShell）
cd f:\binance-volume-alert-master
scp -r smart-crypto-alert your_user@your_server:/home/ubuntu/projects/
```

---

### 步骤3：安装依赖

```bash
cd /home/ubuntu/projects/smart-crypto-alert
npm install

# 验证依赖安装
npm list --depth=0
# 应该看到：
# ├── axios@1.7.2
# ├── dotenv@16.4.5
# ├── https-proxy-agent@7.0.4
# ├── node-telegram-bot-api@0.61.0
# └── technicalindicators@3.1.0
```

---

### 步骤4：配置环境变量

```bash
# 复制配置模板
cp env-example.txt .env

# 编辑配置文件
nano .env
```

**必填配置（只需填这2个）**：
```env
# 从 @BotFather 获取
TELEGRAM_BOT_TOKEN=你的机器人Token

# 从 @userinfobot 获取
TELEGRAM_CHAT_ID=你的聊天ID
```

**可选配置**（已有优化默认值，无需修改）：
```env
# 国内用户需要配置代理
# HTTP_PROXY=http://127.0.0.1:7890
# HTTPS_PROXY=http://127.0.0.1:7890

# 监控周期（默认值已优化）
ENABLE_5M=false
ENABLE_15M=true
ENABLE_1H=true
ENABLE_4H=true
ENABLE_1D=true

# 价格阈值（默认值已优化）
PRICE_THRESHOLD_15M=3.5
PRICE_THRESHOLD_1H=4.5
PRICE_THRESHOLD_4H=5.5
PRICE_THRESHOLD_1D=7.0
```

**详细配置说明见**：[CONFIG.md](CONFIG.md)

保存：`Ctrl+O` → `Enter` → `Ctrl+X`

---

### 步骤5：测试 Telegram 连接

```bash
# 测试 Telegram 配置
npm run test-telegram

# 如果成功，你会在 Telegram 收到测试消息：
# 📤 Sending test alert...
# ✅ Test alert sent. Check your Telegram.
```

**如果失败**：
- 检查 Token 是否正确（没有多余空格）
- 检查 Chat ID 是否正确
- 确认已点击机器人的 START 按钮
- 如果在国内，检查代理配置

---

### 步骤6：测试形态识别（可选）

```bash
# 测试形态识别功能
npm run test-pattern

# 会显示 BTC/ETH/BNB 的形态分析结果
```

---

### 步骤7：启动服务

```bash
# 使用 PM2 启动
pm2 start src/index.js --name smart-crypto-alert

# 查看运行状态
pm2 status

# 应该看到：
# ┌─────┬──────────────────────┬─────────┬─────────┬─────────┐
# │ id  │ name                 │ status  │ restart │ uptime  │
# ├─────┼──────────────────────┼─────────┼─────────┼─────────┤
# │ 0   │ smart-crypto-alert   │ online  │ 0       │ 5s      │
# └─────┴──────────────────────┴─────────┴─────────┴─────────┘
```

---

### 步骤8：查看日志

```bash
# 实时查看日志
pm2 logs smart-crypto-alert

# 你会看到类似输出：
# [2025-10-14 12:30:00] [INFO] Enabled intervals: 15m, 1h, 4h, 1d
# [2025-10-14 12:30:02] [INFO] Fetched 280 USDT perpetual symbols.
# [2025-10-14 12:30:03] [INFO] BTC Market: bullish | ADX: 28 | EMA7: 48200.00
# [2025-10-14 12:30:05] [INFO] [15m] Scanning 280 symbols...
# [2025-10-14 12:30:25] [INFO] [15m] Found 5 candidates in 20000ms.
```

**如果看到这些日志，说明运行正常！** ✅

---

### 步骤9：设置开机自启

```bash
# 保存当前进程列表
pm2 save

# 设置开机自启
pm2 startup

# 会输出一条命令，复制并执行它：
# 例如：sudo env PATH=... pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

---

## 🎯 运行效果预期

### **第一次启动（初始化）**

```
[12:30:00] [INFO] Enabled intervals: 15m, 1h, 4h, 1d
[12:30:02] [INFO] Fetched 280 USDT perpetual symbols.
[12:30:03] [INFO] BTC Market: bullish | ADX: 28
[12:30:05] [INFO] [15m] Scanning 280 symbols...
[12:30:25] [INFO] [15m] Found 5 candidates
[12:30:25] [INFO] [15m] Top 3:
[12:30:25] [INFO]   1. ETHUSDT +4.35% | Vol: 2.3x | RSI: 65 | ADX: 28
[12:30:26] [INFO] Alert sent: ETHUSDT 15m 上涨 (1)
[12:31:00] [INFO] [1h] Scanning 280 symbols...
[12:35:00] [INFO] [Ambush Scanner] Scheduled to run at 8 AM (next run in 1170 minutes)
[12:40:00] [INFO] [Watchlist] Monitor started (checking hourly for entry signals)
```

### **日常运行（每15分钟/每小时/每4小时/每天检查一次）**

```
[13:00:05] [INFO] [15m] Scanning 280 symbols...
[13:00:25] [INFO] [15m] Found 3 candidates
[13:00:26] [INFO] Alert sent: BTCUSDT 15m 上涨 (1)

[14:00:10] [INFO] [1h] Scanning 280 symbols...
[14:00:35] [INFO] [1h] Found 2 candidates

[16:00:30] [INFO] [4h] Scanning 280 symbols...

次日 08:00:00
[08:00:00] [INFO] [Ambush Scanner] Starting daily scan...
[08:05:30] [INFO] [Ambush Scanner] Found 12 candidates
[08:05:31] [INFO] Ambush report sent with 12 candidates
```

---

## 📱 **你会收到的 Telegram 提醒**

### **1. 实时价格异动（15m/1h/4h/1d）**

```
📊 合约价格异动提醒（BTCUSDT 第1次提醒）

交易对: BTCUSDT
周期: 🟡 15m
变动幅度: +4.35% (上涨)
阈值: 3.5%
当前价格: 48,500.00

📈 技术分析:
• RSI(14): 65 ✅ 强势
• MA趋势: 🚀 多头排列
• EMA7: 48,200.00 | EMA25: 47,500.00
• 量能: ⚡ 放量 2.3x
• ADX: 28 （趋势强）

💰 参考位置:
• 支撑位: $47,500.00
• 阻力位: $49,500.00

🔍 形态识别:
• 🔨 锤子线（反转）（置信度75%）

💡 综合评级: A级信号
✅ 建议方向: 可考虑做多

📝 原因分析:
✅ 多头趋势确认
✅ 放量上涨（有买盘）
✅ 趋势强劲（ADX高）

时间: 2025-10-14 13:00:26
```

### **2. 埋伏币日报（每天早上8点）**

```
🔍 埋伏币日报（2025-10-14）

发现 12 个潜力币种，以下是评分最高的标的：

1. ARBUSDT
   评分: 12/15 ⭐⭐⭐⭐
   当前价: $0.8520
   距30日高点: -42.3%
   距60日低点: +8.5%
   RSI: 45 ⬆️
   EMA金叉距离: 1.85%
   整理天数: 12天

2. OPUSDT
   评分: 11/15 ⭐⭐⭐⭐
   ...

💡 说明：
• 这些币种当前处于低位筑底阶段
• 评分 ≥8 表示技术面初步具备启动条件
• 等待 EMA 金叉确认后会发送入场提醒
• 建议先加入自选，观察走势

⚠️ 风险提示：底部形态需要时间确认，请控制仓位！
```

### **3. 入场信号（观察池币种金叉时）**

```
🚀 埋伏币入场信号

交易对: ARBUSDT
信号类型: EMA 金叉确认
观察池评分: 12/15
当前价格: $0.8650

📊 技术确认:
• EMA7: 0.8680
• EMA25: 0.8620
• 量能确认: ✅ 是
• 置信度: 85%

💡 操作建议:
• 可考虑轻仓试探
• 建议仓位: 5-10%
• 止损位: EMA25 下方（$0.8362）

⏰ 2025-10-14 14:30:22
```

---

## ⚙️ **配置已优化说明**

### **周期配置**
```
✅ 15分钟：捕捉短线突破（阈值 3.5%）
✅ 1小时：短期趋势确认（阈值 4.5%）
✅ 4小时：波段机会（阈值 5.5%）
✅ 1天：中长期趋势 + 埋伏扫描（阈值 7.0%）
❌ 5分钟：已关闭（噪音太多）
```

### **预计提醒频率**

**正常市场：**
- 15分钟周期：5-10条/天
- 1小时周期：3-6条/天
- 4小时周期：1-3条/天
- 1天周期：0-2条/天
- 埋伏币日报：1条/天（早上8点）
- 入场信号：1-3条/周
- **总计：每天 10-20 条提醒**

**波动市场：**
- 总计：每天 25-40 条

---

## 🔍 **验证部署成功**

### 1. 检查服务状态
```bash
pm2 status
# 应显示 online
```

### 2. 查看最近日志
```bash
pm2 logs smart-crypto-alert --lines 50
# 应该看到：
# - Enabled intervals: 15m, 1h, 4h, 1d
# - Fetched 280 symbols
# - BTC Market: ...
# - [15m] Scanning...
```

### 3. 等待第一条提醒
- 最快15分钟内会收到第一条（如果有符合条件的）
- 如果30分钟内没收到，可能是市场平静，这是正常的

### 4. 等待埋伏币日报
- 明天早上8点会收到第一份日报
- 如果当时没有符合条件的币，不会发送

---

## 🛠️ **常用管理命令**

```bash
# 查看状态
pm2 status

# 实时查看日志
pm2 logs smart-crypto-alert

# 查看最近100行日志
pm2 logs smart-crypto-alert --lines 100

# 重启服务
pm2 restart smart-crypto-alert

# 停止服务
pm2 stop smart-crypto-alert

# 删除服务
pm2 delete smart-crypto-alert

# 查看详细信息
pm2 show smart-crypto-alert
```

---

## 📊 **功能清单**

### ✅ 实时监控（4个周期）
- 15分钟：短线突破
- 1小时：短期趋势
- 4小时：波段机会
- 1天：中长期趋势

### ✅ 形态识别（16种）
**K线形态（12种）**：
- 锤子线、上吊线、十字星
- 看涨/看跌吞没
- 早晨/黄昏之星
- 蜻蜓/墓碑十字
- 流星线、看涨/看跌孕线

**图表形态（4种）**：
- 双底/双顶
- 平台整理突破
- V形反转

### ✅ 埋伏币系统
- 每日8点全市场扫描
- 15维度评分（0-15分）
- 自动观察池管理
- 金叉入场信号

### ✅ 风险控制
- BTC 市场趋势过滤
- 庄家操作警示（8种场景）
- 冷却机制（防止重复）
- 每日提醒计数重置

---

## ⚠️ **重要提醒**

### **1. 首次启动注意事项**
- 首次运行会拉取 280+ 个交易对，需要 2-5 分钟
- 如果网络慢，可能需要更久
- 看到"Scanning"日志就说明正常了

### **2. 埋伏币扫描时间**
- 每天早上 8:00（服务器本地时间）
- 如果服务器不在中国时区，可能时间对不上
- 可以修改 `monitor.js` 的 `startAmbushScanner` 函数调整时间

### **3. 资源消耗**
- 内存：约 150-300MB
- CPU：扫描时会短暂升高（<10秒），平时很低
- 网络：每次扫描约 500+ API 请求

### **4. API 限制**
- Binance 限制：1200 请求/分钟
- 当前并发：10（CONCURRENCY_LIMIT）
- 280个币 ÷ 10 并发 = 28批 → 约 30秒完成
- 远低于限制，安全 ✅

---

## 🔄 **更新代码**

如果后续需要更新代码：

```bash
# SSH 到服务器
ssh your_server

# 进入项目目录
cd /home/ubuntu/projects/smart-crypto-alert

# 拉取最新代码（如果用 Git）
git pull origin main

# 或者从本地上传新文件（如果用 SCP）
# 在本地执行：
# scp -r src your_user@your_server:/home/ubuntu/projects/smart-crypto-alert/

# 重新安装依赖（如果 package.json 有变化）
npm install

# 重启服务
pm2 restart smart-crypto-alert

# 查看日志确认正常
pm2 logs smart-crypto-alert --lines 30
```

---

## 📋 **故障排查**

### **问题1：服务启动失败**
```bash
# 查看错误日志
pm2 logs smart-crypto-alert --err --lines 50

# 常见原因：
# - .env 配置缺失或错误
# - Node.js 版本过低（需要 v14+）
# - 依赖未安装（npm install）
```

### **问题2：没有收到 Telegram 消息**
```bash
# 检查配置
cat .env | grep TELEGRAM

# 重新测试
npm run test-telegram

# 如果测试成功但运行时不发送：
# - 可能市场没有符合条件的币种
# - 检查日志看是否有 "Alert sent" 字样
```

### **问题3：API 请求超时**
```bash
# 如果看到大量 "Failed to fetch klines" 错误：
# - 可能是网络问题或需要代理
# - 降低并发数：CONCURRENCY_LIMIT=5
# - 配置代理：HTTP_PROXY=...
```

### **问题4：内存占用过高**
```bash
# 如果内存 >500MB：
# - 可能是观察池积累过多
# - 重启服务会清空：pm2 restart smart-crypto-alert
# - 或降低 VOLUME_MEDIAN_PERIODS=15
```

---

## ✅ **部署完成检查清单**

- [ ] Node.js 18+ 已安装
- [ ] PM2 已安装
- [ ] 项目已上传到服务器
- [ ] npm install 已完成
- [ ] .env 已配置（Token + Chat ID）
- [ ] npm run test-telegram 测试成功
- [ ] pm2 start 启动成功
- [ ] pm2 status 显示 online
- [ ] pm2 logs 看到正常日志
- [ ] pm2 save 保存配置
- [ ] pm2 startup 设置开机自启
- [ ] 收到第一条 Telegram 提醒（可能需要等待）

---

## 🌟 高级功能：TA-Lib 微服务（可选）

### 升级到 62 种专业形态识别

**基础版 vs TA-Lib版**：

| 特性 | 基础版 | TA-Lib版 |
|------|--------|----------|
| K线形态数量 | 12种 | 62种 ⭐ |
| 准确率 | 85% | 90%+ ⭐ |
| 技术标准 | 社区库 | 行业标准 ⭐ |

### Linux/Mac 安装（简单）

```bash
# 1. 安装 TA-Lib C库
# Ubuntu/Debian:
sudo apt-get update && sudo apt-get install -y ta-lib

# MacOS:
brew install ta-lib

# 2. 安装 Python 依赖
cd python-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. 测试服务
python test_service.py

# 4. 启动 Python 服务
pm2 start venv/bin/python --name talib-service --interpreter none -- pattern_service.py

# 5. 重启 Node.js 服务
pm2 restart smart-crypto-alert
```

### Windows 安装

```bash
# 1. 下载 TA-Lib 预编译包
# 访问: https://www.lfd.uci.edu/~gohlke/pythonlibs/#ta-lib
# 下载对应版本，例如: TA_Lib-0.4.28-cp311-cp311-win_amd64.whl

# 2. 安装
cd python-service
python -m venv venv
venv\Scripts\activate
pip install TA_Lib-0.4.28-cp311-cp311-win_amd64.whl
pip install -r requirements.txt

# 3. 启动
python pattern_service.py
```

### 验证 TA-Lib 集成

```bash
# 查看 Node.js 日志，应该看到：
pm2 logs smart-crypto-alert

# ✅ TA-Lib service connected - 62 patterns available
# （如果显示此消息，说明成功）

# ⚠️ TA-Lib service not available - using fallback patterns (12)
# （如果显示此消息，Python服务未运行，但主服务仍正常工作）
```

### 自动降级机制

- **TA-Lib可用**：使用62种专业形态
- **TA-Lib不可用**：自动降级到12种基础形态
- **无缝切换**：主服务无需重启

详细文档：[python-service/README.md](python-service/README.md)

---

## 📚 文档导航

| 文档 | 用途 |
|------|------|
| [README.md](README.md) | 项目介绍、功能说明、快速开始 |
| [CONFIG.md](CONFIG.md) | 配置文件详细说明（.env配置） |
| [DEPLOY.md](DEPLOY.md) | 本文档，完整部署指南 |
| [python-service/README.md](python-service/README.md) | TA-Lib微服务（可选） |

---

## 🎉 完成！

所有准备工作已就绪，项目可以直接部署使用了！

祝你交易顺利！🚀


