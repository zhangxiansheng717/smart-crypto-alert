"""
TA-Lib Pattern Recognition Microservice
Provides 62 candlestick patterns detection via HTTP API
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import talib
import numpy as np
import logging

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from Node.js

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# All 62 TA-Lib candlestick patterns
PATTERN_FUNCTIONS = {
    # Two-candle patterns
    'CDL2CROWS': {'name': '两只乌鸦', 'type': 'bearish'},
    'CDL3BLACKCROWS': {'name': '三只乌鸦', 'type': 'bearish'},
    'CDL3INSIDE': {'name': '三内部', 'type': 'bullish'},
    'CDL3LINESTRIKE': {'name': '三线打击', 'type': 'bullish'},
    'CDL3OUTSIDE': {'name': '三外部', 'type': 'bullish'},
    'CDL3STARSINSOUTH': {'name': '南方三星', 'type': 'bullish'},
    'CDL3WHITESOLDIERS': {'name': '三白兵', 'type': 'bullish'},
    'CDLABANDONEDBABY': {'name': '弃婴', 'type': 'reversal'},
    'CDLADVANCEBLOCK': {'name': '前进受阻', 'type': 'bearish'},
    'CDLBELTHOLD': {'name': '捉腰带', 'type': 'reversal'},
    'CDLBREAKAWAY': {'name': '脱离', 'type': 'reversal'},
    'CDLCLOSINGMARUBOZU': {'name': '收盘光头光脚', 'type': 'continuation'},
    'CDLCONCEALBABYSWALL': {'name': '藏婴吞没', 'type': 'bullish'},
    'CDLCOUNTERATTACK': {'name': '反击线', 'type': 'reversal'},
    'CDLDARKCLOUDCOVER': {'name': '乌云盖顶', 'type': 'bearish'},
    'CDLDOJI': {'name': '十字星', 'type': 'neutral'},
    'CDLDOJISTAR': {'name': '十字星线', 'type': 'reversal'},
    'CDLDRAGONFLYDOJI': {'name': '蜻蜓十字', 'type': 'bullish'},
    'CDLENGULFING': {'name': '吞没形态', 'type': 'reversal'},
    'CDLEVENINGDOJISTAR': {'name': '黄昏十字星', 'type': 'bearish'},
    'CDLEVENINGSTAR': {'name': '黄昏之星', 'type': 'bearish'},
    'CDLGAPSIDESIDEWHITE': {'name': '向上跳空并列阳线', 'type': 'bullish'},
    'CDLGRAVESTONEDOJI': {'name': '墓碑十字', 'type': 'bearish'},
    'CDLHAMMER': {'name': '锤子线', 'type': 'bullish'},
    'CDLHANGINGMAN': {'name': '上吊线', 'type': 'bearish'},
    'CDLHARAMI': {'name': '孕线', 'type': 'reversal'},
    'CDLHARAMICROSS': {'name': '十字孕线', 'type': 'reversal'},
    'CDLHIGHWAVE': {'name': '高浪线', 'type': 'neutral'},
    'CDLHIKKAKE': {'name': '陷阱', 'type': 'reversal'},
    'CDLHIKKAKEMOD': {'name': '修正陷阱', 'type': 'reversal'},
    'CDLHOMINGPIGEON': {'name': '家鸽', 'type': 'bullish'},
    'CDLIDENTICAL3CROWS': {'name': '相同三乌鸦', 'type': 'bearish'},
    'CDLINNECK': {'name': '颈内线', 'type': 'bearish'},
    'CDLINVERTEDHAMMER': {'name': '倒锤头', 'type': 'bullish'},
    'CDLKICKING': {'name': '踢腿', 'type': 'reversal'},
    'CDLKICKINGBYLENGTH': {'name': '长踢腿', 'type': 'reversal'},
    'CDLLADDERBOTTOM': {'name': '梯底', 'type': 'bullish'},
    'CDLLONGLEGGEDDOJI': {'name': '长脚十字', 'type': 'neutral'},
    'CDLLONGLINE': {'name': '长线', 'type': 'continuation'},
    'CDLMARUBOZU': {'name': '光头光脚', 'type': 'continuation'},
    'CDLMATCHINGLOW': {'name': '相同低价', 'type': 'bullish'},
    'CDLMATHOLD': {'name': '铺垫', 'type': 'bullish'},
    'CDLMORNINGDOJISTAR': {'name': '早晨十字星', 'type': 'bullish'},
    'CDLMORNINGSTAR': {'name': '早晨之星', 'type': 'bullish'},
    'CDLONNECK': {'name': '颈上线', 'type': 'bearish'},
    'CDLPIERCING': {'name': '刺透形态', 'type': 'bullish'},
    'CDLRICKSHAWMAN': {'name': '黄包车夫', 'type': 'neutral'},
    'CDLRISEFALL3METHODS': {'name': '上升/下降三法', 'type': 'continuation'},
    'CDLSEPARATINGLINES': {'name': '分离线', 'type': 'continuation'},
    'CDLSHOOTINGSTAR': {'name': '流星线', 'type': 'bearish'},
    'CDLSHORTLINE': {'name': '短线', 'type': 'neutral'},
    'CDLSPINNINGTOP': {'name': '纺锤线', 'type': 'neutral'},
    'CDLSTALLEDPATTERN': {'name': '停顿形态', 'type': 'bearish'},
    'CDLSTICKSANDWICH': {'name': '条形三明治', 'type': 'bullish'},
    'CDLTAKURI': {'name': '探水竿', 'type': 'bullish'},
    'CDLTASUKIGAP': {'name': '跳空并列', 'type': 'continuation'},
    'CDLTHRUSTING': {'name': '插入', 'type': 'bearish'},
    'CDLTRISTAR': {'name': '三星', 'type': 'reversal'},
    'CDLUNIQUE3RIVER': {'name': '独特三河', 'type': 'bullish'},
    'CDLUPSIDEGAP2CROWS': {'name': '向上跳空的两只乌鸦', 'type': 'bearish'},
    'CDLXSIDEGAP3METHODS': {'name': '上升/下降跳空三法', 'type': 'continuation'},
}

def detect_all_patterns(open_prices, high_prices, low_prices, close_prices):
    """Detect all 62 candlestick patterns"""
    detected_patterns = []
    
    for func_name, pattern_info in PATTERN_FUNCTIONS.items():
        try:
            # Get TA-Lib function
            func = getattr(talib, func_name)
            
            # Run pattern detection
            result = func(open_prices, high_prices, low_prices, close_prices)
            
            # Check if pattern is detected (last value)
            if len(result) > 0 and result[-1] != 0:
                confidence = abs(result[-1])  # TA-Lib returns -100/0/+100
                signal = 'bullish' if result[-1] > 0 else 'bearish'
                
                detected_patterns.append({
                    'name': pattern_info['name'],
                    'type': pattern_info['type'],
                    'signal': signal,
                    'confidence': confidence,
                    'code': func_name
                })
        except Exception as e:
            logger.error(f"Error detecting {func_name}: {e}")
    
    return detected_patterns

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'TA-Lib Pattern Recognition'})

@app.route('/patterns', methods=['POST'])
def detect_patterns():
    """
    Detect candlestick patterns from klines
    
    Request body:
    {
        "klines": [
            {"open": 100, "high": 105, "low": 99, "close": 103},
            ...
        ]
    }
    """
    try:
        data = request.json
        klines = data.get('klines', [])
        
        if not klines or len(klines) < 3:
            return jsonify({'error': 'Need at least 3 klines'}), 400
        
        # Convert to numpy arrays
        open_prices = np.array([float(k['open']) for k in klines])
        high_prices = np.array([float(k['high']) for k in klines])
        low_prices = np.array([float(k['low']) for k in klines])
        close_prices = np.array([float(k['close']) for k in klines])
        
        # Detect patterns
        patterns = detect_all_patterns(open_prices, high_prices, low_prices, close_prices)
        
        return jsonify({
            'success': True,
            'patterns': patterns,
            'total': len(patterns)
        })
        
    except Exception as e:
        logger.error(f"Pattern detection error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/patterns/list', methods=['GET'])
def list_patterns():
    """List all available patterns"""
    return jsonify({
        'total': len(PATTERN_FUNCTIONS),
        'patterns': [
            {'code': code, **info} 
            for code, info in PATTERN_FUNCTIONS.items()
        ]
    })

@app.route('/indicators', methods=['POST'])
def calculate_indicators():
    """
    Calculate technical indicators
    
    Request body:
    {
        "close": [100, 101, 102, ...],
        "indicators": ["RSI", "MACD", "EMA"]
    }
    """
    try:
        data = request.json
        close = np.array([float(x) for x in data.get('close', [])])
        indicators = data.get('indicators', [])
        
        results = {}
        
        if 'RSI' in indicators:
            results['rsi'] = talib.RSI(close, timeperiod=14).tolist()
        
        if 'MACD' in indicators:
            macd, signal, hist = talib.MACD(close)
            results['macd'] = {
                'macd': macd.tolist(),
                'signal': signal.tolist(),
                'histogram': hist.tolist()
            }
        
        if 'EMA' in indicators:
            results['ema7'] = talib.EMA(close, timeperiod=7).tolist()
            results['ema25'] = talib.EMA(close, timeperiod=25).tolist()
        
        return jsonify({'success': True, 'indicators': results})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("Starting TA-Lib Pattern Recognition Service...")
    logger.info(f"Total patterns available: {len(PATTERN_FUNCTIONS)}")
    app.run(host='0.0.0.0', port=5000, debug=False)

