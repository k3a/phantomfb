#!/usr/bin/phantomjs
// HTTP service for browsing Facebook using PhantomJS
// Copyright (C) 2018 K3A (ww.k3a.me)
// License GNU GPL v3

var fs = require('fs');
var system = require('system');
var webserver = require('webserver');
var page = new WebPage();
var urlparams = require('./urlparams');

// configuration params
var config = {
    email: "fb-email@addr.com",
    password: "mysecretpw",
    listen: "127.0.0.1:8071",
};

// force BB10 UA for simpler interface
page.settings.userAgent = "Mozilla/5.0 (BB10; Kbd) AppleWebKit/537.10+ (KHTML, like Gecko) Version/10.1.0.4633 Mobile Safari/537.10+";

function doLogin() {
    page.evaluate(function (config) {
        var frm = document.getElementById("login_form");

        frm.elements["email"].value = config.email;
        frm.elements["pass"].value = config.password;

        frm.submit();
    }, config);
}

// prepare webserver and listen for request
function HttpListen() {
    var server = webserver.create();
    console.log('listening on ' + config.listen);

    var service = server.listen(config.listen, function (request, response) {
        //console.log(request.method + ' ' + request.url);
        //console.log(JSON.stringify(request));
        var params = urlparams.getAllUrlParams(request.url);

        response.sendOK = function (obj) {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json; charset=utf-8')
            response.write(JSON.stringify(obj));
            response.close();
        };

        response.sendFail = function (reason) {
            response.statusCode = 500;
            var obj = { err: reason };
            response.write(JSON.stringify(obj));
            response.close();
        };

        // /search 
        if (request.url.indexOf('/search') === 0) {
            doSearchFB(params.q, response);
            // not found
        } else {
            response.statusCode = 404;
            response.write('not found');
            response.close();
        }

    });

}

// log page to file for debugging
function logPage(page) {
    fs.write('log.html', page.content, 'w');
}

function isNumber(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

// for every successful page load
page.onLoadFinished = function (status) {
    console.log((!phantom.state ? "no-state" : phantom.state) + ": " + status);

    if (status === "success") {
        if (phantom.state == 'init') {
            phantom.state = "logging-in";
            doLogin();
        } else if (phantom.state === "logging-in") {
            var loginOK = page.evaluate(function () {
                return document.querySelector('form#login_form') == null;
            });

            if (!loginOK) {
                console.log("Error: Wrong user name or password");
                return;
            }

            phantom.state = "ready";
            setTimeout(HttpListen, 0);
        } else if (phantom.state === "search") {
            var resp = page.evaluate(function () {
                // get profile picture element by css selector
                var ppic = document.querySelector('div#BrowseResultsContainer i.profpic');
                if (ppic == null) {
                    // no perrson in the result
                    return {};
                }
                // get value of href attribute of the profile link 
                var plnk = document.querySelector('div#BrowseResultsContainer a').attributes['href'].nodeValue;

                // response object
                return {
                    picture: ppic.style.backgroundImage.match('url\\("?(.*)"?\\)')[1], // stip url( ) around link
                    name: ppic.attributes['aria-label'].nodeValue,
                    profile: 'https://www.facebook.com' + plnk.split('__xt')[0],
                };
            });

            phantom.response.sendOK(resp);
            phantom.state = "ready";
        }
    }
};

// pass-through debug messages
page.onConsoleMessage = function (message) {
    console.log("msg: " + message);
};

// do the FB search to find people 
function doSearchFB(keyword, responseObj) {
    if (phantom.state != "ready") {
        responseObj.sendFail("service not ready (state " + phantom.state + ") - either not logged in or previous request is pending");
        return
    }

    // remove space if it looks like a phone number
    keywordNoSpace = keyword.replace(/\s+/g, '')
    if (isNumber(keywordNoSpace)) {
        keyword = keywordNoSpace;
    }

    phantom.response = responseObj;
    phantom.state = 'search';
    page.open('https://m.facebook.com/graphsearch/str/' + encodeURI(keyword) + '/keywords_search?source=result');
}

function mergeObjects() {
    var resObj = {};
    for (var i = 0; i < arguments.length; i += 1) {
        var obj = arguments[i],
            keys = Object.keys(obj);
        for (var j = 0; j < keys.length; j += 1) {
            resObj[keys[j]] = obj[keys[j]];
        }
    }
    return resObj;
}

// parse config
if (system.args.length == 2) {
    var data = fs.read(system.args[1], 'utf8');
    if (data == null) {
        console.log("Unable to read config file " + system.args[1]);
        phantom.exit(1);
    }

    config = mergeObjects(config, JSON.parse(data));
    data = "";

    if (config == null) {
        console.log("Unable to parse config file " + system.args[1]);
        phantom.exit(1);
    }
} else {
    console.log("Usage: " + system.args[0] + "config.json");
    console.log("");
    console.log("Config format:");
    console.log(JSON.stringify(config));
    console.log("");

    phantom.exit(1);
}

// login to FB
phantom.state = "init";
page.open("http://m.facebook.com");
