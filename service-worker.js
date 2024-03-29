//  outfits/service-worker.js

    self.version = 4.0;
    var debugMode = true;

    self.importScripts(
        "/js/Objectid.js",
        "/js/zangodb.min.js",
        "/socketcluster.js",
        "/sc-codec-min-bin.js",
    );

    var socket = socketCluster.create({
        hostname: "anywhere3d.com",
        codecEngine: scCodecMinBin,
    });

//  IMPORTANT: service worker socket "authState" always is
//  "unauthenticated" as dont have access to localStorage.

    socket.on("connect", function(status){
        debugMode && console.log("[service-worker]:", {"status": status});
    });

    socket.on("error", function (err) {
        console.error( "[service-worker]:", err );
    });

    socket.on("authStateChange", function( state ){
        debugMode && console.log("[service-worker]:", {"authStateChange": state});
    });

    self.addEventListener("install", function(e){
        debugMode && console.log("service worker installed.");

        Promise.all([

            installAvatars(),

        ]).then(activate);

    });

    self.addEventListener("activate", function(e){
        debugMode && console.log("service worker activated.");

        self.clients.claim();

    });


    function installAvatars(){

        var db = new zango.Db( "PUBLIC", {
            "avatars": true,
        });

        var collection = DB.collection("avatars");

        return DB.open(function(err, database){
            if (err) console.error(err);
        }).then( function(){
            debugMode && console.log("Database " + db.name + " (v" + db.version + ") ready for install.");
            return db;
        }).then(function(){

            debugMode && console.log("Fetching data...");

            return new Promise(function(resolve, reject){
                socket.emit("mongo find", {
                    collection:"onsite-avatars",
                    options: { skip:50 }, // debuging!
                    selectors: {
                        "kind": "avatar",
                        "flag": "onsite",
                    },
                }, function(err, data){
                    if (err) console.error(err);
                    resolve(data);
                });
            });

        }).then(function(data){

            if ( !data ) throw "Null data returned!";

            return collection.find()
            .forEach(function(doc){
                if ( !doc ) return;
                var selector = {_id:doc._id};
                collection.remove( selector );
            }, function(err){ 
                if (err) throw err; 
            }).catch(function(err){
                console.error(err);
            }).then(function(){
                return data;
            });

        }).then(function(data){

            debugMode && console.log("Instaling database " + db.name + " (v" + db.version + ") ...");

            return collection.insert(data, function(err){
                if (err) throw err;
            }).then(function(){
                return data;
            }).catch(function(err){
                console.error(err);
            });

        }).then(function(data){
            debugMode && console.log(data);

            return Promise.all([
                caches.open("snapshots").then(function(cache){
                    return cache;
                }),
                caches.open("thumbnails").then(function(cache){
                    return cache;
                }),
            ]).then(function([snapshots, thumbnails]){
                data.forEach(function(doc){
                    if (!doc || !doc.preview) return;
                    var snapsURL = "https://i.imgur.com/" + doc.preview + ".jpg";
                    var thumbURL = "https://i.imgur.com/" + doc.preview + "s.jpg";
                    snapshots.add(snapsURL);
                    thumbnails.add(snapsURL);
                });
            });

        }).catch(function(err){
            console.error(err);
        });
    }

    function activate(){
        self.skipWaiting();
        debugMode && console.log("activated.");
    }

    function clientClaim(){
        self.clients.claim().then(function(){
            debugMode && console.log("claimed.");
            return self.clients.matchAll();
        }).then(function(clients){
            clients[0].navigate(clients[0].url);
        });
    }

    function unistall(){
        self.registration.unregister().then(function(){
            return self.clients.matchAll();
        }).then(function(clients) {
            clients.forEach(function(client){
                client.navigate(client.url);  // will be re-installed on reload!
                console.log("service worker unistalled from client " + client.url);
            });
        });
    }
