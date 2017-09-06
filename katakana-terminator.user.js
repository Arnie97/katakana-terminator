// ==UserScript==
// @name        Katakana Terminator
// @namespace   Arnie97
// @description Convert gairaigo (Japanese loan words) back to English
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
    var katakana = /[\u30A1-\u30FF]+/, match;
    if (!node.nodeValue || !(match = katakana.exec(node.nodeValue))) {
        return false;
    }
    var ruby = _.createElement('ruby');
    ruby.appendChild(_.createTextNode(match[0]));
    var rt = _.createElement('rt');
    rt.appendChild(_.createTextNode('test'));
    ruby.appendChild(rt);

    var after = node.splitText(match.index);
    node.parentNode.insertBefore(ruby, after);
    after.nodeValue = after.nodeValue.substring(match[0].length);
    return after;
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
