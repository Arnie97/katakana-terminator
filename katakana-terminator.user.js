// ==UserScript==
// @name        Katakana Terminator
// @description Convert gairaigo (Japanese loan words) back to English
// @author      Arnie97
// @namespace   https://github.com/Arnie97
// @homepageURL https://github.com/Arnie97/katakana-terminator
// @grant       GM_xmlhttpRequest
// ==/UserScript==

// define some shorthands
var _ = document;

// Forked from https://stackoverflow.com/a/4673436/5072722
String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) {
        return typeof args[number] != 'undefined'? args[number]: match;
    });
};

// Inspired by http://www.the-art-of-web.com/javascript/search-highlight/
function scanTextNodes(node) {
    var excludeTags = /^(?:ruby|script|select|textarea)$/i;
    if (node === undefined || !node) {
        return scanTextNodes(_.body);
    } else if (excludeTags.test(node.nodeName)) {
        return;
    } else if (node.hasChildNodes()) {
        return node.childNodes.forEach(scanTextNodes);
    } else if (node.nodeType == 3) {
        while ((node = addRuby(node)));
    }
}

// Inspired by http://www.the-art-of-web.com/javascript/search-highlight/
function addRuby(node) {
    var katakana = /[\u30A1-\u30FA\u30FC-\u30FF]+/, match;
    if (!node.nodeValue || !(match = katakana.exec(node.nodeValue))) {
        return false;
    }
    var ruby = _.createElement('ruby');
    ruby.appendChild(_.createTextNode(match[0]));
    var rt = _.createElement('rt');
    queue[0].push(match[0]);
    queue[1].push(rt);
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
        return esc(k) + '=' + esc(params[k]);
    }).join('&');
    return base + '?' + query;
}

function googleTranslate(src, dest, text, nodes) {
    var api = 'http://translate.google.cn/translate_a/single';
    var params = {
        client: 't',
        sl: src,
        tl: dest,
        dt: 't',
        tk: googleToken(text.trim()),
        q: text
    };
    GM_xmlhttpRequest({
        method: "GET",
        url: buildURL(api, params),
        onload: function(dom) {
            var escaped_result = dom.response.replace("'", '\u2019');
            var array = JSON.parse(escaped_result)[0];
            for (var i = 0; i < array.length; i++) {
                nodes[i].appendChild(_.createTextNode(array[i][0].trim()));
            }
        }
    });
}

// Forked from https://github.com/cocoa520/Google_TK
function googleToken(r) {
    for(var a=406644,e=[],h=0,n=0;n<r.length;n++){var o=r.charCodeAt(n);128>o?e[h++]=o:(2048>o?e[h++]=o>>6|192:(55296==(64512&o)&&n+1<r.length&&56320==(64512&r.charCodeAt(n+1))?(o=65536+((1023&o)<<10)+(1023&r.charCodeAt(++n)),e[h++]=o>>18|240,e[h++]=o>>12&63|128):e[h++]=o>>12|224,e[h++]=o>>6&63|128),e[h++]=63&o|128)}function t(r,t){for(var a=0;a<t.length-2;a+=3){var e=(e=t.charAt(a+2))>="a"?e.charCodeAt(0)-87:Number(e),e="+"==t.charAt(a+1)?r>>>e:r<<e;r="+"==t.charAt(a)?r+e&4294967295:r^e}return r}for(r=a,h=0;h<e.length;h++)r+=e[h],r=t(r,"+-a^+6");return r=t(r,"+-3^+b+-f"),0>(r^=3293161072)&&(r=2147483648+(2147483647&r)),(r%=1e6).toString()+"."+(r^a)
}

// Split word list into chunks to limit the length of API requests
function chunkTranslate(start, end) {
    if (start == end) {
        return;
    }
    var text  = queue[0].slice(start, end).join('\n');
    var nodes = queue[1].slice(start, end);
    return googleTranslate('ja', 'en', text, nodes);
}

// Exception handling
function main(app_name) {
    try {
        scanTextNodes();
        var chunkSize = 200;
        for (var i = 0; i + chunkSize < queue[0].length; i += chunkSize) {
            chunkTranslate(i, i + chunkSize);
        }
        chunkTranslate(i, queue[0].length);
    } catch (e) {
        console.error('{0}: {1}'.format(app_name, e));
    } finally {
        console.log('{0}: {1} items found'.format(app_name, queue[0].length));
    }
}

var queue = [[], []];
main('Katakana Terminator');
