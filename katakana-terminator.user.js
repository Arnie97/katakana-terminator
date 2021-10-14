// ==UserScript==
// @name        Katakana Terminator
// @description Convert gairaigo (Japanese loan words) back to English
// @author      Arnie97
// @license     MIT
// @copyright   2017-2021, Katakana Terminator Contributors (https://github.com/Arnie97/katakana-terminator/graphs/contributors)
// @namespace   https://github.com/Arnie97
// @homepageURL https://github.com/Arnie97/katakana-terminator
// @supportURL  https://greasyfork.org/scripts/33268/feedback
// @icon        https://upload.wikimedia.org/wikipedia/commons/2/28/Ja-Ruby.png
// @match       *://*/*
// @exclude     *://*.bilibili.com/video/*
// @grant       GM.xmlHttpRequest
// @grant       GM_xmlhttpRequest
// @grant       GM_addStyle
// @connect     translate.google.com
// @connect     translate.google.cn
// @version     2021.10.14
// @name:ja-JP  カタカナターミネーター
// @name:zh-CN  片假名终结者
// @description:zh-CN 在网页中的日语外来语上方标注英文原词
// ==/UserScript==

// define some shorthands
var _ = document;

var queue = {};  // {"カタカナ": [rtNodeA, rtNodeB]}
var cachedTranslations = {};  // {"ターミネーター": "Terminator"}

// Inspired by https://www.the-art-of-web.com/javascript/search-highlight/
function scanTextNodes(node) {
    var excludeTags = {ruby: true, script: true, select: true, textarea: true};
    if (node.nodeName.toLowerCase() in excludeTags) {
        return;
    } else if (node.hasChildNodes()) {
        return Array.prototype.slice.call(node.childNodes).forEach(scanTextNodes);
    } else if (node.nodeType == 3) {
        while ((node = addRuby(node)));
    }
}

// Inspired by http://www.the-art-of-web.com/javascript/search-highlight/
function addRuby(node) {
    var katakana = /[\u30A1-\u30FA\u30FD-\u30FF][\u3099\u309A\u30A1-\u30FF]*[\u3099\u309A\u30A1-\u30FA\u30FC-\u30FF]|[\uFF66-\uFF6F\uFF71-\uFF9D][\uFF65-\uFF9F]*[\uFF66-\uFF9F]/, match;
    if (!node.nodeValue || !(match = katakana.exec(node.nodeValue))) {
        return false;
    }
    var ruby = _.createElement('ruby');
    ruby.appendChild(_.createTextNode(match[0]));
    var rt = _.createElement('rt');
    rt.classList.add('katakana-terminator-rt');
    queue[match[0]] = queue[match[0]] || [];
    queue[match[0]].push(rt);
    ruby.appendChild(rt);

    var after = node.splitText(match.index);
    node.parentNode.insertBefore(ruby, after);
    after.nodeValue = after.nodeValue.substring(match[0].length);
    return after;
}

// Forked from https://stackoverflow.com/a/34209399
function buildURL(base, params) {
    var query = Object.keys(params).map(function(k) {
        var esc = encodeURIComponent;
        // Support arrays in parameters, just like Python Requests
        // {keyA: 1, keyB: [2, 3]} => '?keyA=1&keyB=2&keyB=3'
        if (params[k] instanceof Array) {
            return params[k].map(function(v) {
                return esc(k) + '=' + esc(v);
            }).join('&');
        }
        return esc(k) + '=' + esc(params[k]);
    }).join('&');
    return base + '?' + query;
}

// Split word list into chunks to limit the length of API requests
function translateTextNodes() {
    var apiRequestCount = 0;
    var phraseCount = 0;
    var chunkSize = 200;
    var chunk = [];
    for (var phrase in queue) {
        if (!queue.hasOwnProperty(phrase)) {
            continue;
        }

        phraseCount++;
        if (phrase in cachedTranslations) {
            updateRubyByCachedTranslations(phrase);
            continue;
        }

        chunk.push(phrase);
        if (chunk.length >= chunkSize) {
            apiRequestCount++;
            googleTranslate('ja', 'en', chunk);
            chunk = [];
        }
    }

    if (chunk.length) {
        apiRequestCount++;
        googleTranslate('ja', 'en', chunk);
    }

    console.debug('Katakana Terminator:', phraseCount, 'phrases translated in', apiRequestCount, 'requests, frame', window.location.href);
}

// Google Dictionary API, https://github.com/ssut/py-googletrans/issues/268
function googleTranslate(srcLang, destLang, phrases) {
    // Prevent duplicate HTTP requests before the request completes
    phrases.forEach(function(phrase) {
        cachedTranslations[phrase] = null;
    });

    var joinedText = phrases.join('\n').trim(),
        api = 'https://translate.google.cn/translate_a/t',
        params = {
            client: 'dict-chrome-ex',
            sl: srcLang,
            tl: destLang,
            q: joinedText,
        };
    GM_xmlhttpRequest({
        method: "GET",
        url: buildURL(api, params),
        onload: function(dom) {
            JSON.parse(dom.responseText)['sentences'].forEach(function(s) {
                if (!s.hasOwnProperty('orig')) {
                    return;
                }
                var original = s.orig.trim(),
                    translated = s.trans.trim();
                cachedTranslations[original] = translated;
                updateRubyByCachedTranslations(original);
            });
        },
        onerror: function() {
            phrases.forEach(function(phrase) {
                if (cachedTranslations[phrase]) {
                    delete cachedTranslations[phrase];
                }
            });
        },
    });
}

function updateRubyByCachedTranslations(phrase) {
    if (!cachedTranslations[phrase]) {
        return;
    }
    (queue[phrase] || []).forEach(function(node) {
        node.dataset.rt = cachedTranslations[phrase];
    });
    delete queue[phrase];
}

function main() {
    GM_addStyle("rt.katakana-terminator-rt::before { content: attr(data-rt); }");

    var domChangedSinceLastScan = true;
    var observer = new MutationObserver(function() {
        domChangedSinceLastScan = true;
    });
    observer.observe(_.body, {childList: true, subtree: true});

    function rescanTextNodes() {
        if (!domChangedSinceLastScan) {
            return;
        }

        // Deplete buffered mutations
        observer.takeRecords();
        domChangedSinceLastScan = false;

        scanTextNodes(_.body);
        translateTextNodes();
    }

    // Limit the frequency of API requests
    rescanTextNodes();
    setInterval(rescanTextNodes, 500);
}

// Polyfill for Greasemonkey 4
if (typeof GM_xmlhttpRequest === 'undefined' &&
    typeof GM === 'object' && typeof GM.xmlHttpRequest === 'function') {
    GM_xmlhttpRequest = GM.xmlHttpRequest;
}

if (typeof GM_addStyle === 'undefined') {
    GM_addStyle = function(css) {
        var head = _.getElementsByTagName('head')[0];
        if (!head) {
            return null;
        }

        var style = _.createElement('style');
        style.setAttribute('type', 'text/css');
        style.textContent = css;
        head.appendChild(style);
        return style;
    };
}

main();
