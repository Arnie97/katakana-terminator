// ==UserScript==
// @name        Katakana Terminator
// @description Convert gairaigo (Japanese loan words) back to English
// @author      Arnie97
// @license     MIT
// @copyright   2017-2024, Katakana Terminator Contributors (https://github.com/Arnie97/katakana-terminator/graphs/contributors)
// @namespace   https://github.com/Arnie97
// @homepageURL https://github.com/Arnie97/katakana-terminator
// @supportURL  https://greasyfork.org/scripts/33268/feedback
// @icon        https://upload.wikimedia.org/wikipedia/commons/2/28/Ja-Ruby.png
// @match       *://*/*
// @exclude     *://*.bilibili.com/video/*
// @grant       GM.xmlHttpRequest
// @grant       GM_xmlhttpRequest
// @grant       GM_addStyle
// @connect     translate.google.cn
// @connect     translate.google.com
// @connect     translate.googleapis.com
// @version     2024.05.05
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
        return Array.from(node.childNodes).forEach(scanTextNodes);

    case Node.TEXT_NODE:
        if (rubyLineBreaker && rubyLineBreaker.holds(node)) {
            return;
        }
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
    if (rubyLineBreaker) {
        // Leave the phrase as a plain text node until RubyLineBreaker knows where its lines break
        var phrase = rubyLineBreaker.hold(node.splitText(match.index));
        queue[match[0]] = queue[match[0]] || [];
        queue[match[0]].push(phrase);
        return phrase.splitText(match[0].length);
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

// Firefox never breaks a line inside a ruby base (https://bugzilla.mozilla.org/show_bug.cgi?id=1105051),
// so a long phrase overflows narrow boxes. In such browsers, keep each phrase as plain text until its
// translation arrives, then emit one ruby per line, dividing the annotation at word boundaries
// as Chrome 128+ does natively.
class RubyLineBreaker {
    // Measure a test ruby inside a shadow root, so that page styles neither reach it nor match against it
    static isNeeded() {
        var host = _.createElement('div'), ruby = _.createElement('ruby'), rt = _.createElement('rt');
        host.style.cssText = 'all: initial; display: block; position: absolute; visibility: hidden; width: 0';
        ruby.textContent = 'アイウエオ';
        rt.textContent = 'a b c';
        ruby.appendChild(rt);
        host.attachShadow({mode: 'closed'}).appendChild(ruby);
        _.documentElement.appendChild(host);
        var breaksNatively = ruby.getClientRects().length > 1;
        host.remove();
        return !breaksNatively;
    }

    constructor() {
        this.plainPhrases = new WeakSet();
        this.pending = [];
        this.resizing = false;

        // Line breaks move when the page width changes
        window.addEventListener('resize', () => {
            if (!this.resizing) {
                this.resizing = true;
                requestAnimationFrame(() => {
                    this.resizing = false;
                    this.relayout();
                });
            }
        });
    }

    // Mark a text node as a phrase waiting for its rubies
    hold(phrase) {
        this.plainPhrases.add(phrase);
        return phrase;
    }

    holds(node) {
        return this.plainPhrases.has(node);
    }

    schedule(phrases) {
        if (!phrases.length) {
            return;
        }
        if (!this.pending.length) {
            requestAnimationFrame(() => {
                this.layout(Array.from(new Set(this.pending.splice(0))));
            });
        }
        this.pending.push(...phrases);
    }

    // Replace plain text phrases with one ruby per line
    layout(phrases) {
        // The page may have detached or rewritten a phrase while its translation was pending
        phrases = phrases.filter((phrase) => phrase.isConnected && cachedTranslations[phrase.nodeValue]);
        // Measure everything before changing anything, so that measuring costs a single reflow
        phrases.map(RubyLineBreaker.lineStarts).forEach((starts, i) => {
            var base = phrases[i].nodeValue, words = cachedTranslations[base].split(' ');
            phrases[i].replaceWith(...starts.map((start, j) => {
                var end = starts[j + 1] || base.length;
                var ruby = _.createElement('ruby'), rt = _.createElement('rt');
                ruby.textContent = base.slice(start, end);
                rt.classList.add('katakana-terminator-rt');
                rt.dataset.rt = words.slice(Math.round(words.length * start / base.length), Math.round(words.length * end / base.length)).join(' ');
                rt.dataset.part = j;
                ruby.appendChild(rt);
                return ruby;
            }));
        });
    }

    // Offsets in the text node where a new line begins
    static lineStarts(text) {
        var range = _.createRange(), starts = [], top;
        for (var i = 0; i < text.length; i++) {
            range.setStart(text, i);
            range.setEnd(text, i + 1);
            var rect = range.getBoundingClientRect();
            if (!starts.length || Math.abs(rect.top - top) > 1) {
                starts.push(i);
                top = rect.top;
            }
        }
        return starts;
    }

    // Turn the rubies emitted by layout() for one phrase back into a plain text phrase
    merge(firstRt) {
        var ruby = firstRt.parentNode, base = ruby.firstChild.nodeValue, next;
        while ((next = ruby.nextSibling) && next.lastChild && next.lastChild.classList &&
               next.lastChild.classList.contains('katakana-terminator-rt') && next.lastChild.dataset.part > 0) {
            base += next.firstChild.nodeValue;
            next.remove();
        }
        var phrase = this.hold(_.createTextNode(base));
        ruby.replaceWith(phrase);
        return phrase;
    }

    relayout() {
        this.layout(Array.from(_.querySelectorAll('rt.katakana-terminator-rt[data-part="0"]'), (rt) => this.merge(rt)));
    }
}

// Set up by main() when the browser needs it
var rubyLineBreaker = null;

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
            translate(chunk, apiList);
            chunk = [];
        }
    }

    if (chunk.length) {
        apiRequestCount++;
        translate(chunk, apiList);
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

function translate(phrases) {
    if (!apiList.length) {
        console.error('Katakana Terminator: fallbacks exhausted', phrases);
        phrases.forEach(function(phrase) {
            delete cachedTranslations[phrase];
        });
    }

    // Prevent duplicate HTTP requests before the request completes
    phrases.forEach(function(phrase) {
        cachedTranslations[phrase] = null;
    });

    var api = apiList[0];
    GM_xmlhttpRequest({
        method: "GET",
        url: 'https://' + api.hosts[0] + api.path + buildQueryString(api.params(phrases)),
        onload: function(dom) {
            try {
                api.callback(phrases, JSON.parse(dom.responseText.replace("'", '\u2019')));
            } catch (err) {
                console.error('Katakana Terminator: invalid response', err, dom.responseText);
                apiList.shift();
                return translate(phrases);
            }
        },
        onerror: function() {
            console.error('Katakana Terminator: request error', api.url);
            apiList.shift();
            return translate(phrases);
        },
    });
}

var apiList = [
    {
        // https://github.com/Arnie97/katakana-terminator/pull/8
        name: 'Google Translate',
        hosts: ['translate.googleapis.com'],
        path: '/translate_a/single',
        params: function(phrases) {
            var joinedText = phrases.join('\n').replace(/\s+$/, '');
            return {
                sl: 'ja',
                tl: 'en',
                dt: 't',
                client: 'gtx',
                q: joinedText,
            };
        },
        callback: function(phrases, resp) {
            resp[0].forEach(function(item) {
                var translated = item[0].replace(/\s+$/, ''),
                    original   = item[1].replace(/\s+$/, '');
                cachedTranslations[original] = translated;
                updateRubyByCachedTranslations(original);
            });
        },
    },
    {
        // https://github.com/ssut/py-googletrans/issues/268
        name: 'Google Dictionary',
        hosts: ['translate.google.cn'],
        path: '/translate_a/t',
        params: function(phrases) {
            var joinedText = phrases.join('\n').replace(/\s+$/, '');
            return {
                sl: 'ja',
                tl: 'en',
                dt: 't',
                client: 'dict-chrome-ex',
                q: joinedText,
            };
        },
        callback: function(phrases, resp) {
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
    },
];

// Clear the pending-translation queue
function updateRubyByCachedTranslations(phrase) {
    if (!cachedTranslations[phrase]) {
        return;
    }
    if (rubyLineBreaker) {
        rubyLineBreaker.schedule(queue[phrase] || []);
    } else {
        (queue[phrase] || []).forEach(function(node) {
            node.dataset.rt = cachedTranslations[phrase];
        });
    }
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

    if (RubyLineBreaker.isNeeded()) {
        rubyLineBreaker = new RubyLineBreaker();
    }

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
