// ==UserScript==
// @name        Katakana Terminator
// @description Convert gairaigo (Japanese loan words) back to English
// @author      Arnie97
// @namespace   https://github.com/Arnie97
// @homepageURL https://github.com/Arnie97/katakana-terminator
// @icon        https://upload.wikimedia.org/wikipedia/commons/2/28/Ja-Ruby.png
// @match       *://*/*
// @exclude     *://*.bilibili.com/video/*
// @grant       GM.xmlHttpRequest
// @grant       GM_xmlhttpRequest
// @grant       GM_addStyle
// @connect     translate.google.cn
// @version     2020.04.23
// @name:ja-JP  カタカナターミネータ
// @name:zh-CN  片假名终结者
// @description:zh-CN 在网页中的日语外来语上方标注英文原词
// ==/UserScript==

// define some shorthands
var _ = document;

// Forked from https://stackoverflow.com/a/4673436/5072722
function format(str) {
    var args = Array.prototype.slice.call(arguments, 1);
    return str.replace(/{(\d+)}/g, function(match, number) {
        return args[number] !== undefined? args[number]: match;
    });
}

// Inspired by http://www.the-art-of-web.com/javascript/search-highlight/
function scanTextNodes(node) {
    var excludeTags = /^(?:ruby|script|select|textarea)$/i;
    if (node === undefined || !node) {
        return scanTextNodes(_.body);
    } else if (excludeTags.test(node.nodeName)) {
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

function googleTranslate(src, dest, texts) {
    var full_text = texts.join('\n').trim();
    var api = 'https://translate.google.cn/translate_a/single';
    var params = {
        client: 't',
        sl: src,
        tl: dest,
        dt: ['rm', 't'],
        tk: googleToken(full_text),
        q: full_text
    };
    GM_xmlhttpRequest({
        method: "GET",
        url: buildURL(api, params),
        onload: function(dom) {
            var escaped_result = dom.responseText.replace("'", '\u2019');
            var translations = JSON.parse(escaped_result)[0];
            for (var i = 0; i < texts.length; i++) {
                var result = translations[i][0].trim();
                queue[texts[i]].forEach(function (node) { node.dataset.rt = result; });
            }
        }
    });
}

// Forked from https://github.com/cocoa520/Google_TK
function googleToken(r) {
    for(var a=406644,e=[],h=0,n=0;n<r.length;n++){var o=r.charCodeAt(n);128>o?e[h++]=o:(2048>o?e[h++]=o>>6|192:(55296==(64512&o)&&n+1<r.length&&56320==(64512&r.charCodeAt(n+1))?(o=65536+((1023&o)<<10)+(1023&r.charCodeAt(++n)),e[h++]=o>>18|240,e[h++]=o>>12&63|128):e[h++]=o>>12|224,e[h++]=o>>6&63|128),e[h++]=63&o|128)}function t(r,t){for(var a=0;a<t.length-2;a+=3){var e=(e=t.charAt(a+2))>="a"?e.charCodeAt(0)-87:Number(e),e="+"==t.charAt(a+1)?r>>>e:r<<e;r="+"==t.charAt(a)?r+e&4294967295:r^e}return r}for(r=a,h=0;h<e.length;h++)r+=e[h],r=t(r,"+-a^+6");return r=t(r,"+-3^+b+-f"),0>(r^=3293161072)&&(r=2147483648+(2147483647&r)),(r%=1e6).toString()+"."+(r^a)
}

// Split word list into chunks to limit the length of API requests
function chunkTranslate(keys, start, end) {
    if (start == end) {
        return;
    }
    var texts = keys.slice(start, end);
    return googleTranslate('ja', 'en', texts);
}

// Add our CSS style to page
function addCss() {
    GM_addStyle("rt.katakana-terminator-rt::before { content: attr(data-rt); }");
}

// Exception handling
function main(app_name) {
    try {
        addCss();
        scanTextNodes();
        var keys = Object.keys(queue);
        var chunkSize = 200;
        for (var i = 0; i + chunkSize < keys.length; i += chunkSize) {
            chunkTranslate(keys, i, i + chunkSize);
        }
        chunkTranslate(keys, i, keys.length);
    } catch (e) {
        console.error(format('{0}: {1}', app_name, e));
    } finally {
        console.debug(format('{0}: {1} items found', app_name, Object.keys(queue).length));
    }
}

// Polyfill for Greasemonkey 4
if (typeof GM_xmlhttpRequest === 'undefined' &&
    typeof GM === 'object' && typeof GM.xmlHttpRequest === 'function') {
    GM_xmlhttpRequest = GM.xmlHttpRequest;
}
if (typeof GM_addStyle === 'undefined') {
    GM_addStyle = function (aCss) {
        var head = _.getElementsByTagName('head')[0];
        if (head) {
            var style = _.createElement('style');
            style.setAttribute('type', 'text/css');
            style.textContent = aCss;
            head.appendChild(style);
            return style;
        }
        return null;
    };
}

var queue = {};
main('Katakana Terminator');
