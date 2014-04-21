var fs = require('fs');
var path = require('path');

var async = require('async');
var cheerio = require('cheerio');
var request = require('request');
var sanitizeHtml = require('sanitize-html');
var URI = require('URIjs');

var server = require('./server');
var utils = require('./lib/utils');

var BASE_URL    =   "http://eztv.it";
var SHOWLIST    =   "/showlist/";
var LATEST  =   "/sort/100/";
var SEARCH  =   "/search/";

var TRAK_API_ENDPOINT = URI('http://api.trakt.tv/');
var TRAK_API_KEY = '7b7b93f7f00f8e4b488dcb3c5baa81e1619bb074';

var mongoose = require('mongoose');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));


var showSchema = mongoose.Schema({
        imdb: String,
        title: String,
        year: String,
        rating: String,
        images: {},
        torrents: {}
});

var TVShow = mongoose.model('TVShow', showSchema);

function getText($el) {
    return $el.text().trim();
}


function extractShowInfo(imdb, showUrl) {

    console.log("extractShowInfo " + showUrl);
    var thisShow = {};

    request(BASE_URL + showUrl, function(error, response, html){
        var $$ = cheerio.load(html);
        $$('tr.forum_header_border').each(function(){

            var showStructure = {};
            var showDetails = [];
            var episode_elements = $$(this);
            // title
            var title = episode_elements.children().eq(1).children().attr('title');
            

            if (title) {
                var seasonFound = title.match(/S([0-9]+)E([0-9]+)/);

                if (seasonFound && seasonFound.length > 1) {
                    var saison = seasonFound[1];
                    var episode = seasonFound[2];
                    if (!thisShow[saison]) thisShow[saison] = {};
                    var links = episode_elements.children().eq(2).first().find('a').first().attr('href');
                    thisShow[saison][episode] = links;
                }
            }
        });

        var query = { imdb: imdb };
        TVShow.update(query, { torrents: thisShow });

        console.log(thisShow);
    });
}

function extractTrakt(thisUrl, callback) {

    var slug = thisUrl.match(/\/shows\/(.*)\/(.*)\//)[2];

    console.log("extractTrakt " + slug);
    var uri = TRAK_API_ENDPOINT.clone()
         .segment([
            'show',
            'summaries.json',
            TRAK_API_KEY,
            slug,
            'full'
        ]);

    console.log("request " + uri.toString());
    request({url: uri.toString(), json: true}, function(error, response, data) {

        if(error || !data) {
            //console.log(error);
        } else {
            data = data[0];

            // ok we need all torrents
            //console.log(data);
            
            var show = new TVShow({ imdb: data.imdb_id, title: data.title, year: data.year, images: data.images, slug: slug});
            console.log("New show added to DB : " + show);
            extractShowInfo(show.imdb, thisUrl);

           
        }

    });

    // ok we extract the torrents for this show

    
}


function refreshView(req, res) {

    console.log('\n' + new Date(), '[' + req.method + ']', req.url);
    var allSlugs = [];
    var allUrls = [];
    request.get(BASE_URL + SHOWLIST, function getShowResponse(err, response, body) {
        console.log('Processing:', BASE_URL + SHOWLIST);

        if (err || response.statusCode !== 200) {
            console.error('Could not fetch ' + BASE_URL + SHOWLIST + '\n', err);
        } else {

            var $ = cheerio.load(body);
            $('.thread_link').each(function(){
                var entry = $(this);
                var thisShow = {};
                var showUrl = entry.first().attr('href');
                allUrls.push(showUrl);

            });

            //async.map(allUrls ,extractShowInfo, function showListDone(err, result) {

            //    console.log(result);
                //process.exit();

            //});

            async.map(allUrls ,extractTrakt);            
        }        

    });



    res.json(202, {success: true});
}

function showsViews(req, res) {
    shows = [];
    console.log(TVShow);
    TVShow.find(function (err, show) {
      if (err) return console.error(err);
      shows.push(show);
      console.log("SHOW:" + show);
    })
    console.log(shows);
    res.json(202, JSON.stringify(shows));    
}

var refreshEndpoint = {
    url: '/refresh'
};

var showsEndpoint = {
    url: '/shows'
};

server.get(refreshEndpoint, refreshView);
server.get(showsEndpoint, showsViews);

server.listen(process.env.PORT || 5000, function() {
    console.log('%s listening at %s', server.name, server.url);
});