"""
Test script for TA-Lib Pattern Service
"""

import requests
import json

SERVICE_URL = 'http://localhost:5000'

def test_health():
    """Test health check endpoint"""
    print("🔍 Testing health check...")
    try:
        response = requests.get(f'{SERVICE_URL}/health', timeout=2)
        if response.status_code == 200:
            print("✅ Health check passed:", response.json())
            return True
        else:
            print("❌ Health check failed:", response.status_code)
            return False
    except Exception as e:
        print(f"❌ Service not available: {e}")
        return False

def test_pattern_detection():
    """Test pattern detection with sample data"""
    print("\n🔍 Testing pattern detection...")
    
    # Sample klines data (bullish hammer pattern)
    klines = [
        {"open": 100, "high": 102, "low": 98, "close": 99},
        {"open": 99, "high": 101, "low": 97, "close": 98},
        {"open": 98, "high": 100, "low": 95, "close": 99.5},  # Hammer-like
        {"open": 99.5, "high": 103, "low": 99, "close": 102},
        {"open": 102, "high": 105, "low": 101, "close": 104},
    ]
    
    try:
        response = requests.post(
            f'{SERVICE_URL}/patterns',
            json={'klines': klines},
            timeout=5
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Pattern detection successful")
            print(f"   Total patterns found: {data['total']}")
            
            if data['patterns']:
                print("\n📊 Detected patterns:")
                for pattern in data['patterns'][:5]:  # Show first 5
                    print(f"   • {pattern['name']} ({pattern['type']}) - "
                          f"信号: {pattern['signal']}, "
                          f"置信度: {pattern['confidence']}%")
            else:
                print("   No patterns detected (this is normal for random data)")
            return True
        else:
            print(f"❌ Pattern detection failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_list_patterns():
    """Test pattern list endpoint"""
    print("\n🔍 Testing pattern list...")
    
    try:
        response = requests.get(f'{SERVICE_URL}/patterns/list', timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Pattern list retrieved")
            print(f"   Total patterns available: {data['total']}")
            print("\n📋 Sample patterns:")
            for pattern in data['patterns'][:10]:  # Show first 10
                print(f"   • {pattern['name']} ({pattern['type']})")
            return True
        else:
            print(f"❌ Failed to get pattern list: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_indicators():
    """Test indicator calculation"""
    print("\n🔍 Testing indicator calculation...")
    
    close_prices = [100, 101, 102, 101, 103, 105, 104, 106, 108, 107, 
                   109, 111, 110, 112, 114, 113, 115, 117, 116, 118]
    
    try:
        response = requests.post(
            f'{SERVICE_URL}/indicators',
            json={
                'close': close_prices,
                'indicators': ['RSI', 'MACD', 'EMA']
            },
            timeout=5
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Indicator calculation successful")
            
            if 'indicators' in data:
                if 'rsi' in data['indicators']:
                    rsi_values = [v for v in data['indicators']['rsi'] if v is not None]
                    if rsi_values:
                        print(f"   RSI (last): {rsi_values[-1]:.2f}")
                
                if 'ema7' in data['indicators']:
                    ema7_values = [v for v in data['indicators']['ema7'] if v is not None]
                    if ema7_values:
                        print(f"   EMA7 (last): {ema7_values[-1]:.2f}")
                
                if 'ema25' in data['indicators']:
                    ema25_values = [v for v in data['indicators']['ema25'] if v is not None]
                    if ema25_values:
                        print(f"   EMA25 (last): {ema25_values[-1]:.2f}")
            
            return True
        else:
            print(f"❌ Indicator calculation failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    """Run all tests"""
    print("=" * 60)
    print("🧪 TA-Lib Pattern Service Test Suite")
    print("=" * 60)
    
    results = []
    
    # Run tests
    results.append(("Health Check", test_health()))
    results.append(("Pattern Detection", test_pattern_detection()))
    results.append(("List Patterns", test_list_patterns()))
    results.append(("Indicator Calculation", test_indicators()))
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Test Summary")
    print("=" * 60)
    
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    total_passed = sum(1 for _, passed in results if passed)
    total_tests = len(results)
    
    print(f"\nTotal: {total_passed}/{total_tests} tests passed")
    
    if total_passed == total_tests:
        print("\n🎉 All tests passed! Service is working correctly.")
    else:
        print("\n⚠️ Some tests failed. Please check the service configuration.")

if __name__ == '__main__':
    main()

