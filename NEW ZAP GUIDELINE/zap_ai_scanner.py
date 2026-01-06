#!/usr/bin/env python3
"""
ZAP Maximum Performance Scanner - AI Agent Wrapper
Designed for automated AI-driven security testing

Usage:
    python3 zap_ai_scanner.py <target_url> [options]

Examples:
    python3 zap_ai_scanner.py https://example.com
    python3 zap_ai_scanner.py https://app.co.jp --max-duration 180
    python3 zap_ai_scanner.py https://api.internal.local --quick
"""

import sys
import time
import json
import subprocess
import requests
import argparse
from urllib.parse import urlparse

class ZAPScanner:
    def __init__(self, target_url, zap_api="http://localhost:8080"):
        self.target = target_url
        self.zap_api = zap_api
        self.context_name = "AIAutomatedScan"
        self.domain = urlparse(target_url).netloc
        
    def log(self, message, level="INFO"):
        """Structured logging for AI parsing"""
        print(f"[{level}] {message}", flush=True)
        
    def api_call(self, endpoint, params=None):
        """Make ZAP API call with error handling"""
        url = f"{self.zap_api}/JSON/{endpoint}"
        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            self.log(f"API call failed: {endpoint} - {str(e)}", "ERROR")
            return None
            
    def wait_for_zap(self, timeout=120):
        """Wait for ZAP to be ready"""
        self.log("Waiting for ZAP to start...")
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                result = self.api_call("core/view/version")
                if result:
                    version = result.get('version', 'unknown')
                    self.log(f"ZAP ready (version: {version})")
                    return True
            except:
                pass
            time.sleep(2)
            
        self.log("ZAP failed to start", "ERROR")
        return False
        
    def configure_spider(self, max_depth=20, max_duration=120):
        """Configure traditional spider for maximum discovery"""
        self.log("Configuring traditional spider...")
        
        configs = {
            "spider/action/setOptionMaxDepth": {"Integer": max_depth},
            "spider/action/setOptionMaxDuration": {"Integer": max_duration},
            "spider/action/setOptionMaxChildren": {"Integer": 0},
            "spider/action/setOptionThreadCount": {"Integer": 10},
            "spider/action/setOptionPostForm": {"Boolean": "true"},
            "spider/action/setOptionProcessForm": {"Boolean": "true"},
            "spider/action/setOptionParseComments": {"Boolean": "true"},
            "spider/action/setOptionParseSitemapXml": {"Boolean": "true"},
            "spider/action/setOptionParseRobotsTxt": {"Boolean": "false"},
            "spider/action/setOptionSendRefererHeader": {"Boolean": "true"},
        }
        
        for endpoint, params in configs.items():
            self.api_call(endpoint, params)
            
        self.log("Traditional spider configured")
        
    def configure_ajax_spider(self, max_duration=120):
        """Configure AJAX spider for JavaScript-heavy sites"""
        self.log("Configuring AJAX spider...")
        
        configs = {
            "ajaxSpider/action/setOptionMaxDuration": {"Integer": max_duration},
            "ajaxSpider/action/setOptionMaxCrawlDepth": {"Integer": 10},
            "ajaxSpider/action/setOptionNumberOfBrowsers": {"Integer": 4},
            "ajaxSpider/action/setOptionBrowserId": {"String": "firefox-headless"},
            "ajaxSpider/action/setOptionClickDefaultElems": {"Boolean": "true"},
            "ajaxSpider/action/setOptionClickElemsOnce": {"Boolean": "false"},
            "ajaxSpider/action/setOptionRandomInputs": {"Boolean": "true"},
        }
        
        for endpoint, params in configs.items():
            self.api_call(endpoint, params)
            
        self.log("AJAX spider configured")
        
    def configure_active_scanner(self, max_duration=180):
        """Configure active scanner for aggressive testing"""
        self.log("Configuring active scanner...")
        
        configs = {
            "ascan/action/setOptionThreadPerHost": {"Integer": 10},
            "ascan/action/setOptionHostPerScan": {"Integer": 10},
            "ascan/action/setOptionMaxScanDurationInMins": {"Integer": max_duration},
            "ascan/action/setOptionMaxRuleDurationInMins": {"Integer": 30},
            "ascan/action/setOptionDelayInMs": {"Integer": 0},
            "ascan/action/setOptionHandleAntiCSRFTokens": {"Boolean": "true"},
            "ascan/action/setOptionInjectPluginIdInHeader": {"Boolean": "true"},
        }
        
        for endpoint, params in configs.items():
            self.api_call(endpoint, params)
            
        self.log("Active scanner configured")
        
    def create_context(self):
        """Create scan context with proper scope"""
        self.log(f"Creating context for {self.domain}...")
        
        # Create context
        self.api_call("context/action/newContext", {"contextName": self.context_name})
        
        # Include domain and subdomains
        domain_regex = self.domain.replace(".", "\\.")
        self.api_call("context/action/includeInContext", {
            "contextName": self.context_name,
            "regex": f"https?://{domain_regex}.*"
        })
        self.api_call("context/action/includeInContext", {
            "contextName": self.context_name,
            "regex": f"https?://.*\\.{domain_regex}.*"
        })
        
        # Exclude logout patterns
        for pattern in [".*logout.*", ".*signout.*", ".*sign-out.*", ".*sign_out.*"]:
            self.api_call("context/action/excludeFromContext", {
                "contextName": self.context_name,
                "regex": pattern
            })
            
        # Set context in scope
        self.api_call("context/action/setContextInScope", {
            "contextName": self.context_name,
            "booleanInScope": "true"
        })
        
        self.log(f"Context created for {self.domain}")
        
    def run_spider(self):
        """Run traditional spider"""
        self.log("=== PHASE 1: TRADITIONAL SPIDER ===")
        
        # Start spider
        result = self.api_call("spider/action/scan", {
            "url": self.target,
            "contextName": self.context_name,
            "recurse": "true",
            "subtreeOnly": "false"
        })
        
        if not result:
            self.log("Failed to start spider", "ERROR")
            return 0
            
        spider_id = result.get('scan')
        self.log(f"Spider ID: {spider_id}")
        
        # Monitor progress
        while True:
            status_result = self.api_call("spider/view/status", {"scanId": spider_id})
            if not status_result:
                break
                
            status = status_result.get('status', '0')
            if status == '100':
                break
                
            results = self.api_call("spider/view/results", {"scanId": spider_id})
            url_count = len(results.get('results', [])) if results else 0
            
            self.log(f"Spider: {status}% | URLs: {url_count}")
            time.sleep(5)
            
        # Get final count
        results = self.api_call("spider/view/results", {"scanId": spider_id})
        final_count = len(results.get('results', [])) if results else 0
        self.log(f"Traditional spider complete: {final_count} URLs found")
        return final_count
        
    def run_ajax_spider(self):
        """Run AJAX spider for JavaScript crawling"""
        self.log("=== PHASE 2: AJAX SPIDER ===")
        
        # Start AJAX spider
        self.api_call("ajaxSpider/action/scan", {
            "url": self.target,
            "inScope": "true",
            "contextName": self.context_name
        })
        
        self.log("AJAX spider started")
        
        # Monitor progress
        while True:
            status_result = self.api_call("ajaxSpider/view/status")
            if not status_result:
                break
                
            status = status_result.get('status', 'running')
            if status == 'stopped':
                break
                
            results = self.api_call("ajaxSpider/view/numberOfResults")
            url_count = results.get('numberOfResults', 0) if results else 0
            
            self.log(f"AJAX Spider: {status} | URLs: {url_count}")
            time.sleep(10)
            
        # Get final count
        results = self.api_call("ajaxSpider/view/numberOfResults")
        final_count = results.get('numberOfResults', 0) if results else 0
        self.log(f"AJAX spider complete: {final_count} URLs found")
        return final_count
        
    def wait_for_passive_scan(self):
        """Wait for passive scan to complete"""
        self.log("=== PHASE 3: PASSIVE SCAN ===")
        
        while True:
            result = self.api_call("pscan/view/recordsToScan")
            if not result:
                break
                
            records = int(result.get('recordsToScan', 0))
            if records == 0:
                break
                
            self.log(f"Passive scan: {records} records remaining")
            time.sleep(5)
            
        self.log("Passive scan complete")
        
    def run_active_scan(self):
        """Run active scan"""
        self.log("=== PHASE 4: ACTIVE SCAN ===")
        
        # Start active scan
        result = self.api_call("ascan/action/scan", {
            "url": self.target,
            "recurse": "true",
            "inScopeOnly": "true",
            "scanPolicyName": "Default Policy",
            "contextName": self.context_name
        })
        
        if not result:
            self.log("Failed to start active scan", "ERROR")
            return
            
        scan_id = result.get('scan')
        self.log(f"Active scan ID: {scan_id}")
        
        # Monitor progress
        while True:
            status_result = self.api_call("ascan/view/status", {"scanId": scan_id})
            if not status_result:
                break
                
            status = status_result.get('status', '0')
            if status == '100':
                break
                
            alerts = self.api_call("core/view/numberOfAlerts")
            alert_count = alerts.get('numberOfAlerts', 0) if alerts else 0
            
            self.log(f"Active scan: {status}% | Alerts: {alert_count}")
            time.sleep(15)
            
        self.log("Active scan complete")
        
    def generate_reports(self, output_prefix="zap-report"):
        """Generate scan reports"""
        self.log("=== PHASE 5: GENERATING REPORTS ===")
        
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        prefix = f"{output_prefix}-{timestamp}"
        
        # HTML report
        try:
            response = requests.get(f"{self.zap_api}/OTHER/core/other/htmlreport/")
            with open(f"{prefix}.html", "wb") as f:
                f.write(response.content)
            self.log(f"HTML report: {prefix}.html")
        except Exception as e:
            self.log(f"Failed to generate HTML report: {e}", "ERROR")
            
        # JSON report
        try:
            response = requests.get(f"{self.zap_api}/OTHER/core/other/jsonreport/")
            with open(f"{prefix}.json", "wb") as f:
                f.write(response.content)
            self.log(f"JSON report: {prefix}.json")
        except Exception as e:
            self.log(f"Failed to generate JSON report: {e}", "ERROR")
            
        # XML report
        try:
            response = requests.get(f"{self.zap_api}/OTHER/core/other/xmlreport/")
            with open(f"{prefix}.xml", "wb") as f:
                f.write(response.content)
            self.log(f"XML report: {prefix}.xml")
        except Exception as e:
            self.log(f"Failed to generate XML report: {e}", "ERROR")
            
    def get_statistics(self):
        """Get final scan statistics"""
        self.log("=== SCAN STATISTICS ===")
        
        # Total URLs
        urls = self.api_call("core/view/numberOfUrls")
        url_count = urls.get('numberOfUrls', 0) if urls else 0
        self.log(f"Total URLs discovered: {url_count}")
        
        # Total alerts
        alerts = self.api_call("core/view/numberOfAlerts")
        alert_count = alerts.get('numberOfAlerts', 0) if alerts else 0
        self.log(f"Total alerts: {alert_count}")
        
        # Alert breakdown
        summary = self.api_call("core/view/alertsSummary")
        if summary and 'alertsSummary' in summary:
            breakdown = summary['alertsSummary']
            self.log(f"  High Risk: {breakdown.get('High', 0)}")
            self.log(f"  Medium Risk: {breakdown.get('Medium', 0)}")
            self.log(f"  Low Risk: {breakdown.get('Low', 0)}")
            self.log(f"  Informational: {breakdown.get('Informational', 0)}")
            
        return {
            "target": self.target,
            "urls": url_count,
            "alerts": alert_count,
            "breakdown": summary.get('alertsSummary', {}) if summary else {}
        }
        
    def run_full_scan(self, quick_mode=False):
        """Run complete scan workflow"""
        self.log("=== ZAP MAXIMUM PERFORMANCE SCAN ===")
        self.log(f"Target: {self.target}")
        
        if not self.wait_for_zap():
            return False
            
        # Configuration
        if quick_mode:
            self.configure_spider(max_depth=10, max_duration=30)
            self.configure_ajax_spider(max_duration=30)
            self.configure_active_scanner(max_duration=60)
        else:
            self.configure_spider(max_depth=20, max_duration=120)
            self.configure_ajax_spider(max_duration=120)
            self.configure_active_scanner(max_duration=180)
            
        self.create_context()
        
        # Access target
        self.api_call("core/action/accessUrl", {"url": self.target})
        time.sleep(2)
        
        # Discovery phase
        spider_urls = self.run_spider()
        ajax_urls = self.run_ajax_spider()
        
        total_urls = self.api_call("core/view/numberOfUrls")
        url_count = total_urls.get('numberOfUrls', 0) if total_urls else 0
        
        self.log(f"=== DISCOVERY COMPLETE: {url_count} total URLs ===")
        
        if url_count < 5:
            self.log("WARNING: Very low URL count - target may block scanning", "WARNING")
            
        # Scanning phase
        self.wait_for_passive_scan()
        self.run_active_scan()
        
        # Results
        self.generate_reports()
        stats = self.get_statistics()
        
        self.log("=== SCAN COMPLETE ===")
        return stats


def main():
    parser = argparse.ArgumentParser(
        description='ZAP Maximum Performance Scanner - AI Automation Wrapper',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument('target', help='Target URL to scan (e.g., https://example.com)')
    parser.add_argument('--zap-api', default='http://localhost:8080', 
                       help='ZAP API endpoint (default: http://localhost:8080)')
    parser.add_argument('--quick', action='store_true',
                       help='Quick scan mode (reduced depth and duration)')
    parser.add_argument('--output', default='zap-report',
                       help='Output report prefix (default: zap-report)')
    
    args = parser.parse_args()
    
    # Validate URL
    parsed = urlparse(args.target)
    if not parsed.scheme or not parsed.netloc:
        print(f"ERROR: Invalid URL: {args.target}")
        print("URL must include scheme (http:// or https://)")
        sys.exit(1)
        
    # Run scan
    scanner = ZAPScanner(args.target, args.zap_api)
    result = scanner.run_full_scan(quick_mode=args.quick)
    
    if result:
        print("\n" + "="*50)
        print(json.dumps(result, indent=2))
        sys.exit(0)
    else:
        print("\nScan failed - check logs above")
        sys.exit(1)


if __name__ == "__main__":
    main()
