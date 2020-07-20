"use strict";

// npm modules
const express = require("express");
const router = express.Router();
const twilio = require("twilio");
const values = require("object.values");

// application requires
const config = require("../config");

const client = twilio(config.accountSid, config.authToken);

router.get("/", function (req, res, next) {
   client.messages.list({ to: config.phoneNumber }).then(function (messages) {
      messages = messages.reduce(function (accumulator, currentMessage) {
         if (!accumulator[currentMessage.from]) {
            accumulator[currentMessage.from] = currentMessage;
         }
         return accumulator;
      }, {});
      messages = values(messages);
      res.render("index", {
         messages: messages,
         title: "Inbox",
      });
   });
});

router.get("/outbox", function (req, res, next) {
   client.messages.list({ from: config.phoneNumber }).then(function (messages) {
      messages = messages.reduce(function (accumulator, currentMessage) {
         if (!accumulator[currentMessage.to]) {
            accumulator[currentMessage.to] = currentMessage;
         }
         return accumulator;
      }, {});
      messages = values(messages);
      res.render("outbox", {
         messages: messages,
         title: "Outbox",
      });
   });
});

router.get("/messages/new", function (req, res, next) {
   res.render("new", {
      title: "New message",
   });
});

router.post("/messages", function (req, res, next) {
   var results = [];
   var broadcast = false;
   if (req.body.phoneNumber.includes(",")) {
      broadcast = true;
      var numbers = req.body.phoneNumber.split(",");
      for (let i = 0; i < numbers.length; i++) {
         sendMessage(config.phoneNumber, numbers[i], req.body.body, results, (i == numbers.length - 1 ? true : false));
      }
   } else {
      sendMessage(
         config.phoneNumber,
         req.body.phoneNumber,
         req.body.body,
         results,
         true
      );
   }

   function returnResults() {
      console.log(results);

      var errors = [];
      for (let i = 0; i < results.length; i++) {
         if (results[i][0] == "error") {
            errors.push(results[i]);
         }
      }

      if (errors.length > 0) {
         //has error
         if (req.xhr) {
            var errorStr = "";
            for (let i = 0; i < errors.length; i++) {
               errorStr += JSON.stringify(errors[i][1]) + "\n\n";
            }
            res.setHeader("Content-Type", "application/json");
            res.status(errors[0][0]).send(errorStr);
         } else {
            res.redirect(req.header("Referer") || "/");
         }
      } else {
         if (req.xhr) {
            res.setHeader("Content-Type", "application/json");
            res.send(JSON.stringify({ result: "success" }));
         } else if (!broadcast) {
            res.redirect(
               "/messages/" + req.body.phoneNumber + "#" + results[0][1].sid
            );
         } else {
            res.redirect("/outbox");
         }
      }
   }
   function sendMessage(from, to, body, results, lastMessage) {
      client.messages
         .create({
            from: from,
            to: to,
            body: body,
         })
         .then(function (data) {
            results.push(["success", data]);

            if (lastMessage) {
               returnResults();
            }

            // if (req.xhr) {
            //    res.setHeader("Content-Type", "application/json");
            //    res.send(JSON.stringify({ result: "success" }));
            // } else {
            //    res.redirect(
            //       "/messages/" + req.body.phoneNumber + "#" + data.sid
            //    );
            // }
         })
         .catch(function (err) {
            results.push(["error", err]);

            if (lastMessage) {
               returnResults();
            }

            // if (req.xhr) {
            //    res.setHeader("Content-Type", "application/json");
            //    res.status(err.status).send(JSON.stringify(err));
            // } else {
            //    res.redirect(req.header("Referer") || "/");
            // }
         });
   }
});

router.get("/messages/:phoneNumber", function (req, res, next) {
   let incoming = client.messages.list({
      from: req.params.phoneNumber,
      to: config.phoneNumber,
   });
   let outgoing = client.messages.list({
      from: config.phoneNumber,
      to: req.params.phoneNumber,
   });
   Promise.all([incoming, outgoing]).then(function (values) {
      var allMessages = values[0].concat(values[1]);
      allMessages.sort(function (a, b) {
         let date1 = Date.parse(a.dateCreated);
         let date2 = Date.parse(b.dateCreated);
         if (date1 == date2) {
            return 0;
         } else {
            return date1 < date2 ? -1 : 1;
         }
      });
      allMessages = allMessages.map(function (message) {
         message.isInbound = message.direction === "inbound";
         message.isOutbound = message.direction.startsWith("outbound");
         return message;
      });
      res.render("show", {
         messages: allMessages,
         phoneNumber: req.params.phoneNumber,
         bodyClass: "messages",
         title: req.params.phoneNumber,
      });
   });
});

module.exports = router;
