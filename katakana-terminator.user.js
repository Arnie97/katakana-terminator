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
// @version     2022.02.18
// @name:ja-JP  カタカナターミネーター
// @name:zh-CN  片假名终结者
// @description:zh-CN 在网页中的日语外来语上方标注英文原词
// ==/UserScript==

// define some shorthands
var _ = document;

var queue = {};  // {"カタカナ": [rtNodeA, rtNodeB]}
var cachedTranslations = {};  // {"ターミネーター": "Terminator"}
var newNodes = [_.body];

// Recursively traverse the given node and its descendants (Depth-first search)
function scanTextNodes(node) {
    // The node could have been detached from the DOM tree
    if (!node.parentNode || !_.body.contains(node)) {
        return;
    }

    // Ignore text boxes and echoes
    var excludeTags = {ruby: true, script: true, select: true, textarea: true};

    switch (node.nodeType) {
    case Node.ELEMENT_NODE:
        if (node.tagName.toLowerCase() in excludeTags || node.isContentEditable) {
            return;
        }
        return node.childNodes.forEach(scanTextNodes);

    case Node.TEXT_NODE:
        while ((node = addRuby(node)));
    }
}

// Recursively add ruby tags to text nodes
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
    ruby.appendChild(rt);

    // Append the ruby title node to the pending-translation queue
    queue[match[0]] = queue[match[0]] || [];
    queue[match[0]].push(rt);

    // <span>[startカナmiddleテストend]</span> =>
    // <span>start<ruby>カナ<rt data-rt="Kana"></rt></ruby>[middleテストend]</span>
    var after = node.splitText(match.index);
    node.parentNode.insertBefore(ruby, after);
    after.nodeValue = after.nodeValue.substring(match[0].length);
    return after;
}

// Split word list into chunks to limit the length of API requests
function translateTextNodes() {
    var apiRequestCount = 0;
    var phraseCount = 0;
    var chunkSize = 200;
    var chunk = [];

    for (var phrase in queue) {
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

    if (phraseCount) {
        console.debug('Katakana Terminator:', phraseCount, 'phrases translated in', apiRequestCount, 'requests, frame', window.location.href);
    }
}

// {"keyA": 1, "keyB": 2} => "?keyA=1&keyB=2"
function buildQueryString(params) {
    return '?' + Object.keys(params).map(function(k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
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
        url: api + buildQueryString(params),
        onload: function(dom) {
            var resp = JSON.parse(dom.responseText);

            // ["katakana\nterminator"]
            if (!resp.sentences) {
                var translated = resp[0].split('\n');
                if (translated.length !== phrases.length) {
                    throw [phrases, resp];
                }
                translated.forEach(function(trans, i) {
                    var orig = phrases[i];
                    cachedTranslations[orig] = trans;
                    updateRubyByCachedTranslations(orig);
                });
                return;
            }

            resp.sentences.forEach(function(s) {
                if (!s.orig) {
                    return;
                }
                var original = s.orig.trim(),
                    translated = s.trans.trim();
                cachedTranslations[original] = translated;
                updateRubyByCachedTranslations(original);
            });
        },
    });
}

// Clear the pending-translation queue
function updateRubyByCachedTranslations(phrase) {
    if (!cachedTranslations[phrase]) {
        return;
    }
    (queue[phrase] || []).forEach(function(node) {
        node.dataset.rt = cachedTranslations[phrase];
    });
    delete queue[phrase];
}

// Watch newly added DOM nodes, and save them for later use
function mutationHandler(mutationList) {
    mutationList.forEach(function(mutationRecord) {
        mutationRecord.addedNodes.forEach(function(node) {
            newNodes.push(node);
        });
    });
}

function main() {
    GM_addStyle("rt.katakana-terminator-rt::before { content: attr(data-rt); }");

    var observer = new MutationObserver(mutationHandler);
    observer.observe(_.body, {childList: true, subtree: true});

    function rescanTextNodes() {
        // Deplete buffered mutations
        mutationHandler(observer.takeRecords());
        if (!newNodes.length) {
            return;
        }

        console.debug('Katakana Terminator:', newNodes.length, 'new nodes were added, frame', window.location.href);
        newNodes.forEach(scanTextNodes);
        newNodes.length = 0;
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

// Polyfill for ES5
if (typeof NodeList.prototype.forEach === 'undefined') {
    NodeList.prototype.forEach = function(callback, thisArg) {
        thisArg = thisArg || window;
        for (var i = 0; i < this.length; i++) {
            callback.call(thisArg, this[i], i, this);
        }
    };
}

main();
