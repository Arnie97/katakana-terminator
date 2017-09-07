// ==UserScript==
// @name        Katakana Terminator
// @namespace   Arnie97
// @description Convert gairaigo (Japanese loan words) back to English
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

// Inspired by https://github.com/akira-kurogane/furigana-injector/blob/master/chrome_extension/text_to_furigana_dom_parse.js
function scanTextNodes() {
    var xPath = '//*[{0}]/text()[normalize-space(.) != ""]'.format(
        '(*{0}select{0}textarea{0}script{0}ruby)'.format(
            ') and not (ancestor-or-self::'
        )
    );
    var s = _.evaluate(xPath, _.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (var i = 0; i < s.snapshotLength; i++) {
       var node = s.snapshotItem(i);
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
    googleTranslate('ja', 'en', match[0], rt);
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

function googleTranslate(src, dest, text, node) {
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
            var array = JSON.parse(dom.response);
            node.appendChild(_.createTextNode(array[0][0][0]));
        }
    });
}

// Forked from https://github.com/cocoa520/Google_TK
function googleToken(r) {
    for(var a=406644,e=[],h=0,n=0;n<r.length;n++){var o=r.charCodeAt(n);128>o?e[h++]=o:(2048>o?e[h++]=o>>6|192:(55296==(64512&o)&&n+1<r.length&&56320==(64512&r.charCodeAt(n+1))?(o=65536+((1023&o)<<10)+(1023&r.charCodeAt(++n)),e[h++]=o>>18|240,e[h++]=o>>12&63|128):e[h++]=o>>12|224,e[h++]=o>>6&63|128),e[h++]=63&o|128)}function t(r,t){for(var a=0;a<t.length-2;a+=3){var e=(e=t.charAt(a+2))>="a"?e.charCodeAt(0)-87:Number(e),e="+"==t.charAt(a+1)?r>>>e:r<<e;r="+"==t.charAt(a)?r+e&4294967295:r^e}return r}for(r=a,h=0;h<e.length;h++)r+=e[h],r=t(r,"+-a^+6");return r=t(r,"+-3^+b+-f"),0>(r^=3293161072)&&(r=2147483648+(2147483647&r)),(r%=1e6).toString()+"."+(r^a)
}

// Exception handling
function main(app_name) {
    try {
        scanTextNodes();
    } catch (e) {
        console.error('{0}: {1}'.format(app_name, e));
    } finally {
        console.info('{0}: loaded'.format(app_name));
    }
}

main('Katakana Terminator');
