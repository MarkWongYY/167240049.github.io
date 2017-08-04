var express     = require('express');
var app         = express();
var mysql       = require('mysql');
var dateTime    = require('node-datetime');
var firebase    = require('firebase-admin');
var firebaseAuth = require('firebase');
var localConfig = require('./conf/config.json');
var bodyParser  = require('body-parser');
var cryptLib    = require('cryptlib');
var _           = require('lodash');
var cors        = require('cors');
var config      = localConfig;
var db_option   = config.db_option;
var moment      = require('moment')

firebase.initializeApp({
  credential : firebase.credential.cert(config.serviceAccount),
  databaseURL : config.firebase.databaseURL
});
firebaseAuth.initializeApp(config.firebase);
var auth = firebaseAuth.auth();
var db = firebase.database();


var cryptLibKey = cryptLib.getHashSha256('ThVzBnzEkUTBvTg7T4YjCGCdyRb9yCFN', 32)
var cryptLibIV = 'T_PD5HIx0W8vyU3A'

function letEnc(text) {
  if(_.isNumber(text)){
    text = String(text)
  }
  var encrypted = cryptLib.encrypt(text, cryptLibKey, cryptLibIV);
  return encrypted;
}

function letDec(text) {
  var decrypted = cryptLib.decrypt(text, cryptLibKey, cryptLibIV);
  return decrypted;
}

function letEncObject(object) {
  var result = {};
  _.forEach(object, function(value, key) {
      if(_.isNumber(value)){
        value = String(value)
      }
      result[key] = cryptLib.encrypt(value, cryptLibKey, cryptLibIV);
  })
  return result;
}

function letDecObject(object) {
  var result = {};
  _.forEach(object, function(value, key) {
    result[key] = cryptLib.decrypt(value, cryptLibKey, cryptLibIV);
  })
  return result;
}


var dt = dateTime.create();
var formatted = dt.format('Y-m-d H:M:S');

app.use(bodyParser.json());
app.use(cors());

app.get('/', function (req, res) {
  res.status(200).send('Hi, this is the portal!');
})

//For check login
app.post('/login', function (req, res) {
  /* 
    Description : "Login page"
    route : /login
    params : email , password 
    result : 200 / 500
    msg : {
      200: Login success and uid
      500: Login fail
      }
  */
  var email = req.body.email;
  var password = req.body.password;
  auth.signInWithEmailAndPassword(email, password).then(function(user) {
    if(user.uid != undefined) {
      db.ref('user'+'/'+user.uid).once('value', function(snapshot) {
        var role = letDec(snapshot.val().role_type)
        res.status(200).send({'msg' : 'Login success ', 'user' : user.uid, 'role' : role, 'encryptedEmail' : snapshot.val().email}) // add 1 more param for that case
      })
    }
    else {
      res.send({'msg' : 'Login fail'})
    }
  }).catch(function(error) {
    res.send({'msg' : error.message })
  })
})

app.post('/createAccount', function (req, res) {
  var email = req.body.email;
  var password = req.body.password;
  var loginUid = req.body.loginUid;
  if(_.isEmpty(loginUid)) {
    res.send({'msg' : 'Please login first!'});
  } else {
    db.ref('user/' + loginUid).once('value').then(function(snapshot) {
      if(letDec(snapshot.val().role_type) == 'Admin') {
        auth.createUserWithEmailAndPassword(email, password).then(function(user) {
          if(user.uid) {
            var uid = user.uid;
            var insertData = req.body.data;
            var data = letEncObject(insertData);
              // data.bankCardID = letEnc(req.body.bankCardID); // data.cvc = letEnc(req.body.cvc); // data.fullname = letEnc(req.body.fullname);
              // data.job = letEnc(req.body.job); // data.idCard = letEnc(req.body.idCard); // data.phoneNo = letEnc(req.body.phoneNo); // data.gen = letEnc(req.body.gen);
              // data.isActive = letEnc(req.body.isActive); // data.birthday = letEnc(req.body.birthday); // data.role_type = letEnc(req.body.role_type);
            data.userMoney  = letEnc('0');
            data.createDate = formatted;
            data.editDate   = formatted;
            data.editBy     = loginUid;
            data.createBy   = loginUid;
            data.email      = letEnc(req.body.email);
            db.ref('user/'+uid).set(data).then(function() {
              res.status(200).send({'msg' : 'complete', 'user' : uid})
            })
          }
        }).catch(function(error){
          res.send({'msg' : error.message});
        })
      } else {
        res.send({'msg' : 'You have no permission to create account!'});
      }

    })
  }
})

app.post('/report', function (req, res) {
  var loginUid = req.body.loginUid;
  var results  = [];
  var decItem = {};
  db.ref('transaction/' + loginUid).once('value').then(function(snapshot) {
    if(snapshot.val()) {
      var counter = 0;
      _.forEach(snapshot.val(), function(item){
        counter ++;
        var timestamp = String(item.timestamp).substring(0,  String(item.timestamp).length - 3);
        if(timestamp >= moment().add(-90, 'day').unix()){
          decItem.from = letDec(item.from);
          decItem.target = letDec(item.target);
          decItem.amount = letDec(item.amount);
          decItem.remark = item.remark;
          decItem.timestamp = moment.unix(timestamp).format("DD MMM YYYY hh:mm:ss a");
          results.push(decItem)
        }
        if(counter == _.size(snapshot.val())) {
          res.send({'msg' : results})
        }
      })
    } else if(_.size(snapshot.val()) == 0) {
      res.send({'msg' : 'No record'})
    }
    else {
      res.send({'msg' : 'Login first'})
    }
  })
});

app.get('/reportreceive/:uid', function (req, res) {
  var login = req.params.uid;
  var results  = [];
  var decItem = {};
  db.ref('transaction').once('value', function(snapshot) {
    if(snapshot.val()){
      snapshot.forEach(function(recSnapshot) {
        recSnapshot.forEach(function(dataSnap){
          if(dataSnap.val().tarID == login) {
            var timestamp = String(dataSnap.val().timestamp).substring(0,  String(dataSnap.val().timestamp).length - 3);
            if(timestamp >= moment().add(-90, 'day').unix()){
              decItem.from = letDec(dataSnap.val().from);
              decItem.target = letDec(dataSnap.val().target);
              decItem.amount = letDec(dataSnap.val().amount);
              decItem.remark = dataSnap.val().remark;
              decItem.timestamp = moment.unix(timestamp).format("DD MMM YYYY hh:mm:ss a");
              results.push(decItem)
            }
          }
        })
      })
      res.send({'msg' : results});
    }
  })
});

////For Transaction
app.post('/trans', function (req, res) {   //should be Post
  var method = req.body.method;
  var senderID = req.body.senderID;
  var tarAcc = req.body.tarAcc;
  var receiverID = req.body.receiverID;
  var tranAmount = req.body.tranAmount;
  var userInfo = {};
  db.ref('user/' + senderID).once('value').then(function(snapshot) {
    userInfo = snapshot.val();
    var uuserMoney = letDec(userInfo.userMoney);
    var ucvc = letDec(userInfo.cvc);
    var ubankCardID = letDec(userInfo.bankCardID);
    if(letDec(userInfo.isActive)!='Active') {
      res.send({'msg' : 'This account cannot transfer the money. Please contant the App company.'});
    } else {
      db.ref('user'+'/'+receiverID).once('value', function(receiveSnapshot) {
        if(!(_.isEmpty(receiveSnapshot.val()))){
          var receiverMoney = receiveSnapshot.val().userMoney;
          var tempRM = letDec(receiverMoney);
          if (letDec(receiveSnapshot.val().isActive) != "Active") {
            res.send({'msg' : 'The receiver account is deactived.'});
          }
          else if (method === "CreditCard") {
            var connection = mysql.createConnection(db_option);
            var query = 'INSERT INTO `Transaction`(`PayAcc`, `PayCVC`, `TargetAcc`, `amount`, `TranDate`, `TranMeth`) VALUES ("'+ubankCardID+'","'+ucvc+'","'+tarAcc+'",'+tranAmount+',"' + formatted + '","Transfer Money by App")';
            connection.query(query, function(err, rows, fields) {
              console.log(err);
              if(err) {
                res.send({'msg' : 'The bank is not accept the exchange.'});
              }
              else {
                //add to firebase
                receiverMoney = letEnc(String(Number(tempRM) + Number(tranAmount)));
                db.ref('user/' + receiverID + '/userMoney').set(receiverMoney);
                var data = {
                  "amount" : tranAmount,
                  "target" : tarAcc
                }
                data = letEncObject(data);
                data.from = userInfo.email;
                data.timestamp = firebase.database.ServerValue.TIMESTAMP;
                data.tarID = receiverID;
                data.remark = "Transfer money by bank card";
                db.ref('transaction/' + senderID).push(data);
                res.status(200).send({'msg' : 'complete'});
              }
            });
          }
          else if (method === "Charge"){
            var calcautedAmount = (Number(uuserMoney))-Number(tranAmount);
            if( calcautedAmount < 0 || (Number(uuserMoney)) == 0 || Number(tranAmount) == 0) {
              res.send({'msg' : 'You have no enough money to transfer, please charge the money first.'})
            } else {
              calcautedAmount = letEnc(calcautedAmount)
              receiverMoney = letEnc(String(Number(tempRM) + Number(tranAmount)));
              db.ref('user/' + senderID + '/userMoney').set(calcautedAmount);
              db.ref('user/' + receiverID + '/userMoney').set(receiverMoney);
              var data = {
                  "amount" : tranAmount,
                  "target" : tarAcc
                }
              data = letEncObject(data);
              data.from = userInfo.email;
              data.remark = "Transfer money by charge card";
              data.timestamp = firebase.database.ServerValue.TIMESTAMP;
              data.tarID = receiverID;
              db.ref('transaction/' + senderID).push(data);
              res.status(200).send({'msg' : 'complete'});
              //res.send({'msg' : 'Thank you for your purchase.'});
            }
          }
        }
        
      })
      
    }
  })

})

app.post('/pushChargeCard', function(req, res){
  var loginUid = req.body.loginUid;
  var data = {};
  data.chargeCardNo = req.body.chargeCardNo;
  data.chargeCardStatus = req.body.chargeCardStatus;
  data.chargeCardCreateDate = formatted;
  data.usedUser = '';
  data.amount = req.body.amount;
  data.dateOfUsed = '';
  data.createBy = loginUid;
  if(loginUid == null) {
    res.send({'msg' : 'Please login first!'});
  } else {
    db.ref('user' + '/' + loginUid).once('value').then(function(snapshot) {
      if(letDec(snapshot.val().role_type) == 'Admin') {
        db.ref('chargeCard'+'/'+data.chargeCardNo).once('value').then(function(cardsnap) {
          if(_.isEmpty(cardsnap.val())) {
            db.ref('chargeCard'+'/'+data.chargeCardNo).set(data).then(function(response) {
              res.status(200).send({'msg' : 'complete'})
            })
          } else {
            res.send({'msg' : 'The charge card is exist.'})
          }
        })
      }
    })
  }
})

app.post('/getExistMoney', function(req, res){ 
  var loginUid = req.body.loginUid;
  db.ref('user'+'/'+loginUid).once('value', function(snapshot) {
    var userMoney = letDec(snapshot.val().userMoney);
    res.status(200).send({'msg' : userMoney});
  }, function(error) {
     res.send({'msg' : 'Cannot get the money!'})
  })
})

app.post('/useChargeCard', function(req, res){
  var loginUid = req.body.loginUid;
  var chargeCardNo = req.body.chargeCardNo;
  if(loginUid == null) {
    res.send({'msg' : 'Please login first!'});
  } else {
    db.ref('user'+'/'+loginUid).once('value', function(snapshot) {
      if(letDec(snapshot.val().isActive) != "Active") {
        res.send({'msg' : 'This account cannot charge the money. Please contant the App company.'});
      } else {
        var userData = snapshot.val();
        var userMoney = letDec(userData.userMoney);
        db.ref('chargeCard'+'/'+chargeCardNo).once('value', function(snapshotCard) {
          if(_.isEmpty(snapshotCard.val()) || snapshotCard.val().chargeCardStatus != 'Active'){
            res.send({'msg' : 'The charge card is invalid.'})
          } else {
            var cardData = snapshotCard.val();
            cardData.usedUser = loginUid;
            cardData.dateOfUsed = formatted;
            cardData.chargeCardStatus = 'Deactive';
            userData.userMoney = letEnc(String(Number(userMoney) + Number(cardData.amount)));
            db.ref('user'+'/'+loginUid).set(userData);
            db.ref('chargeCard'+'/'+cardData.chargeCardNo).set(cardData).then(function(response) {
              res.status(200).send({'msg' : 'complete', 'existMoney' : String(Number(userMoney) + Number(cardData.amount))});
            }), function(error) {
              res.send({'msg' : 'The charge card is invalid.'})
            }
          }
        })
      }
    })
  }
})

//retrieve data from firebase
app.get('/getData/:key', function(req, res) {
  var key = req.params.key; //unique key
  db.ref('user'+'/'+key).once('value', function(snapshot) {
    var recData = snapshot.val();
    var data = {};
    if(_.isEmpty(recData)){
      res.send({'msg' : "The account is not exist"})
    } else {
      data.uid = key;
      data.bankCardID = letDec(recData.bankCardID);
      data.cvc = letDec(recData.cvc);
      data.fullname = letDec(recData.fullname);
      data.job = letDec(recData.job);
      data.idCard = letDec(recData.idCard);
      data.phoneNo = letDec(recData.phoneNo);
      data.isActive = letDec(recData.isActive);
      data.userMoney = letDec(recData.userMoney);
      data.role_type = letDec(recData.role_type);
      data.gen = letDec(recData.gen);
      data.birthday = letDec(recData.birthday);
      data.email = letDec(recData.email);
      data.createBy = recData.createBy;
      data.createDate = recData.createDate;
      data.editDate = recData.editDate;
      res.status(200).send({'msg' : data});
    }
  })
})

app.get('/getDBE/:email', function(req, res) {
  var email = req.params.email;
  var encryptedEmail = letEnc(email);
  var data = {};
  db.ref('user').orderByChild('email').equalTo(encryptedEmail).limitToFirst(1).once("value", function(snapshot) {
    if(_.isEmpty(snapshot.val())) {
      res.send({'msg' : 'The account is not exist!'})
    } else {
      snapshot.forEach(function(child) {
        data.bankCardID = letDec(child.val().bankCardID);
        data.birthday = letDec(child.val().birthday);
        data.createBy = child.val().createBy;
        data.createDate = child.val().createDate;
        data.cvc = letDec(child.val().cvc);
        data.editBy = child.val().editBy;
        data.editDate = child.val().editDate;
        data.email = letDec(child.val().email);
        data.fullname = letDec(child.val().fullname);
        data.gen = letDec(child.val().gen);
        data.idCard = letDec(child.val().idCard);
        data.isActive = letDec(child.val().isActive);
        data.job = letDec(child.val().job);
        data.phoneNo = letDec(child.val().phoneNo);
        data.role_type = letDec(child.val().role_type);
        data.userMoney = letDec(child.val().userMoney);
        data.uid = child.key;
        res.status(200).send({'msg' : data});
      })
    }
  })
})

app.post('/updateInfo', function(req, res) {
  var target = req.body.target;
  var admin = req.body.editBy;
  if(_.isEmpty(admin)) {
    res.send({'msg' : 'Please login first'});
  } else {
      db.ref('user'+'/'+admin).once('value', function(snapshot) {
        if(letDec(snapshot.val().role_type) == 'Admin') {
          db.ref('user'+'/'+target).once('value', function(tarsnap) {
            if(_.isEmpty(tarsnap.val())) {
              res.send({'msg' : 'Please enter the correct user email.'})
            } else {
              var updateData = tarsnap.val();
              updateData.bankCardID = letEnc(req.body.bankCardID);
              updateData.cvc        = letEnc(req.body.cvc);
              updateData.editBy     = admin;
              updateData.editDate   = formatted;
              updateData.fullname   = letEnc(req.body.fullname);
              updateData.gen        = letEnc(req.body.gen);
              updateData.isActive   = letEnc(req.body.isActive);
              updateData.job        = letEnc(req.body.job);
              updateData.phoneNo    = letEnc(req.body.phoneNo);
              updateData.role_type  = letEnc(req.body.role_type);
              db.ref('user/'+target).set(updateData).then(function() {
                res.status(200).send({'msg' : 'complete'})
              })
            }
          })
        }
      })
  }
})


app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})
