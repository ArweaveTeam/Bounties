$('.grid').click(() => {
  $('#content-modal').addClass('active');
  $('.wrapper').addClass('blur');
  $("html, body").animate({ scrollTop: 0 }, "slow");
});

$('.content-modal .icon').click(() => {
  $('#content-modal').removeClass('active');
  $('#upload-modal').removeClass('active');
  $('.wrapper').removeClass('blur');
});

$('.upload-button').click(() => {
  $('#upload-modal').addClass('active');
  //$('.wrapper').addClass('blur');
  $("html, body").animate({ scrollTop: 0 }, "slow");
});

// Initialize Arweave blockchain connection...
const arweave = Arweave.init({
	host: 'arweave.net',// Hostname or IP address for a Arweave node
	port: 443,           // Port, defaults to 1984
	protocol: 'https',  // Network protocol http or https, defaults to http
	timeout: 20000,     // Network request timeouts in milliseconds
	logging: false,     // Enable network request logging
});

arweave.network.getInfo().then("Connected to Arweave Network:", console.log);

// Connect to IPFS
var ipfs = window.IpfsHttpClient('ipfs.infura.io', '5001', {protocol: 'https'});
console.log("Connected to IPFS via Infura (:5001)");

function upload(wallet) {

  // Read chosen wallet file (NOT UPLOADED!)
  var reader = new FileReader();
  reader.onload = function(event) {

    // Parse JSON
    var jsonObj = JSON.parse(event.target.result);

    // Fetch public key
    arweave.wallets.jwkToAddress(jsonObj).then((address) => {
        console.log("Logged in as: ", address);

        // Fetch balance
        arweave.wallets.getBalance(address).then((balance) => {
          var total = arweave.ar.winstonToAr(balance);
          console.log("Balance: " + total + " AR");

          // Check if we can upload
          if(balance <= 0)
          {
            alert("Error: You must have AR in your wallet to upload an app!")
          } else {

            // Get app file
            var app = $('#appfile').prop('files')[0];
            var arr = app.name.split(".");
            var filetype = arr[arr.length-1];
            //console.log("appfile TYPE:", filetype);

            // Create a transaction
            arweave.createTransaction({
                data: '<html><head><meta charset="UTF-8"><title>Hello world!</title></head><body></body></html>',
            }, jsonObj).then((transaction) => {
              transaction.addTag('Content-Type', 'text/html');
              transaction.addTag('appstore_filetype', filetype);
              //transaction.addTag('appstore_title', $('#title').val());

              // PROCESS UPLOAD:
              // Get selected image
              var file = $('#appimage').prop('files')[0];

              var reader = new FileReader();
              reader.readAsDataURL(file);
              reader.onload = function () {
                console.log("Got image contents: ", reader.result);
                var fileString = reader.result;

                // Create new app object to store metadata
                var newApp = {
                  title: $('#title').val(),
                  description: $('#description').val(),
                  image: fileString
                };

                // Upload app/metadata object to IPFS:
                console.log("Upload to IPFS: ", newApp, JSON.stringify(newApp));
                var metadata = JSON.stringify(newApp);

                const Buffer = window.IpfsApi().Buffer;
                var ifpsBuffer = Buffer.from(metadata);
                ipfs.add([ifpsBuffer], {pin:false})
                  .then(response => {
                    var hash = response[0].hash;
                    if(hash) {

                      transaction.addTag('appstore_metadata', hash);

                      // Sign the transaction
                      arweave.transactions.sign(transaction, jsonObj).then((info) => {
                        console.log("Signed transaction:", transaction)

                        // Submit the transaction
                        arweave.transactions.post(transaction).then((response) => {
                          if(!response) {
                            alert("Error: Unable to submit transaction!");
                          }
                          else {
                            var success = 0;
                            switch(response.status) {
                              case 200:
                                console.log("Success!");
                                success = 1;
                                break;
                              case 400:
                                alert("Error: Invalid transaction!");
                                break;
                              case 500:
                                alert("Error: Unknown error!");
                                break;
                            }

                          }
                        });

                      });
                    }
                  });

              };
              reader.onerror = function (error) {
                console.log('Error: ', error);
              };

            });
          }
        });
    });
  }
  reader.readAsText(document.getElementById('walletUpload').files[0]);
}


function getApps(filetype) {
  // Create query
  var query;
  if(!filetype || filetype == "all") {
    query = {
      op: "or",
      expr1: {
        op: "equals",
        expr1: "appstore_filetype",
        expr2: "ipa"
      },
      expr2: {
        op: "equals",
        expr1: "appstore_filetype",
        expr2: "apk"
      },
      expr3: {
        op: "equals",
        expr1: "appstore_filetype",
        expr2: "crx"
      },
      expr4: {
        op: "equals",
        expr1: "appstore_filetype",
        expr2: "xpi"
      }
    };
  } else {
    query = {
      op: "equals",
      expr1: "appstore_filetype",
      expr2: filetype
    };
  }

  // Query for all appstore transactions/uploads
  arweave.arql(query).then((txids) => {
    $('#apps').html('');
    console.log(txids);
    // For each app...
    var count = 0;
    txids.forEach(txn_id => {
      arweave.transactions.get(txn_id).then(transaction => {
        // Use the get method to get a specific transaction field.
        console.log(txn_id, transaction.get('signature'));
        // NLiRQSci56KVNk-x86eLT1TyF1ST8pzE-s7jdCJbW-V...
        console.log(transaction.get('data'));
        //CjwhRE9DVFlQRSBodG1sPgo8aHRtbCBsYW5nPSJlbiI-C...
        // Get the data base64 decoded as a Uint8Array byte array.
        console.log(transaction.get('data', {decode: true}));
        //Uint8Array[10,60,33,68,79,67,84,89,80,69...
        // Get the data base64 decoded as a string.
        console.log(transaction.get('data', {decode: true, string: true}));
        //<!DOCTYPE html><html lang="en"><head> <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"> <title>ARWEAVE / PEER EXPLORER</title>
        transaction.get('tags').forEach(tag => {
          let key = tag.get('name', {decode: true, string: true});
          let value = tag.get('value', {decode: true, string: true});
          console.log(`${key} : ${value}`);

          if(key == 'appstore_metadata')  {
            ipfs.get(value, function (err, files) {
              files.forEach((file) => {
                console.log(file.path)
                var payload = file.content.toString('utf8');

                if(payload.substring(0,1) == '{') {
                  var metadata = JSON.parse(payload);
                  console.log("Metadata = ", metadata);

                  // Set <a> link
                  var link = 'https://arweave.net/'+txn_id;
                  var title = metadata.title;
                  var description = metadata.description;
                  var image = metadata.image;

                  count++;
                  if(count == 1) {
                    $('#apps').append('<div class="gc-1"> <div class="grid g1" style="background: url(\''+image+'\'); background-size: cover;">  <div class="upper-headline">'+description+'</div> <div class="headline">'+title+'</div>  <div class="content" >  </div></div>');
                  }
                  if(count == 2) {
                    $('#apps').append('<div class="grid g2"> <div class="upper-headline">World Premiere</div>   <div class="headline">  The Art of the Impossible   </div> <div class="content"> </div> <div class="footline">Inside the extraordinary world of Monument Valley 2</div></div> </div>');
                  }
                  if(count == 3) {
                  $('#apps').append('<div class="gc-2"> <div class="grid g3">  <div class="upper-headline"></div>  <div class="headline">  </div>  <div class="content atd"> App of the day  </div>  <div class="footline"> <div class="head">Hitlist</div><div class="subhead">Cheap flights, airline tickets</div>  </div> </div>');
                  }
                  if(count == 4) {
                    $('#apps').append('<div class="grid g4"><div class="upper-headline">Collection</div><div class="headline"> The Perfect Coffee Break  </div>  <div class="content">  </div> </div>  </div> </div>');
                    count = 0;
                  }
                  if(count == 1 || count % 3 == 0) {
                    console.log("count = ", count);
                    $('#apps').append('</div><!-- added -->');
                  }
                }

              })
            });

          }

          if(key == 'appstore_filetype') {
            // set file
          }
        });
        // Content-Type : text/html // User-Agent : ArweaveDeploy/1.1.0
      });
    });
});
}

getApps("all");


// IPFS Stuff:

function getBase64(file) {
   var reader = new FileReader();
   reader.readAsDataURL(file);
   reader.onload = function () {
     console.log("Got image contents: ", reader.result);
   };
   reader.onerror = function (error) {
     console.log('Error: ', error);
   };
}

async function ipfsUpload(data) {
  const Buffer = window.IpfsApi().Buffer;
  var ifpsBuffer = Buffer.from(data);
  ipfs.add([ifpsBuffer], {pin:false})
    .then(response => {
      var hash = response[0].hash;
      if(hash) {
        console.log("IPFS hash = ", hash);
        //hash = web3.utils.asciiToHex(hash);
        //hash = web3.utils.hexToBytes(hash);

        // Write to blockchain
        console.log("HEXed Hash =", hash);
        /*
        //hash = web3.utils.asciiToHex(hash); //<-- Convert to hex so we can write to blockchain
        contractInstance.methods.broadcast(hash).send({from: account})
        .on('transactionHash', function(hash){
          //alert("Transaction Pending. Hash = " + hash);
          //alert("Transaction Pending. Hash = ", hash);
          window.open("https://etherscan.io/tx/"+hash);
        })
        .on('receipt', function(receipt){
          console.log("Transaction complete! TXN ID = ", receipt);
          alert("Transaction complete!"); // TXN ID = " + receipt);
          window.location.replace("verify#"+receipt.events.LogHash.returnValues.hash);
        })
        .on('confirmation', function(confirmationNumber, receipt){
          if(confirmationNumber<20)
            console.log("Confirmation #", confirmationNumber, receipt);
        })
        .on('error', console.error);
        */

      }
    }).catch((err) => {
        console.log(err);
        return false;
    });
}

function fetchIPFS(hash) {
  ipfs.get(hash, function (err, files) {
    files.forEach((file) => {
      //console.log(file.path)
      console.log(file.content.toString('utf8'))
    })
  });
}

function processUpload() {
  // Get selected image
  var file = $('#appimage').prop('files')[0];

  var reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = function () {
    console.log("Got image contents: ", reader.result);
    var fileString = reader.result;

    // Create new app object to store metadata
    var newApp = {
      title: $('#title').val(),
      description: $('#description').val(),
      image: fileString
    };

    // Upload app/metadata object to IPFS:
    console.log("Upload to IPFS: ", newApp, JSON.stringify(newApp));
    ipfsUpload(JSON.stringify(newApp));
  };
  reader.onerror = function (error) {
    console.log('Error: ', error);
  };
}
