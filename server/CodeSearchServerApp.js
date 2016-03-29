Accounts.registerLoginHandler(function(loginRequest) {
  if(!loginRequest.admin) {
    return undefined;
  }

  if(loginRequest.password != 'admin-password') {
    return null;
  }

  var userId = null;
  var user = Meteor.users.findOne({username: 'admin'});
  if(!user) {
    userId = Meteor.users.insert({username: 'admin'});
  } else {
    userId = user._id;
  }

  Tasks = new Mongo.Collection("tasks");

  if (Meteor.isServer) {
    // This code only runs on the server
    // Only publish tasks that are public or belong to the current user
    Meteor.publish("tasks", function () {
      return Tasks.find({
        $or: [
          { private: {$ne: true} },
          { owner: this.userId }
        ]
      });
    });
  }

  if (Meteor.isClient) {
    // This code only runs on the client
    Meteor.subscribe("tasks");

    Template.body.helpers({
      tasks: function () {
        if (Session.get("hideCompleted")) {
          // If hide completed is checked, filter tasks
          return Tasks.find({checked: {$ne: true}}, {sort: {createdAt: -1}});
        } else {
          // Otherwise, return all of the tasks
          return Tasks.find({}, {sort: {createdAt: -1}});
        }
      },
      hideCompleted: function () {
        return Session.get("hideCompleted");
      },
      incompleteCount: function () {
        return Tasks.find({checked: {$ne: true}}).count();
      }
    });

    Template.body.events({
      "submit .new-task": function (event) {
        // Prevent default browser form submit
        event.preventDefault();

        // Get value from form element
        var text = event.target.text.value;

        // Insert a task into the collection
        Meteor.call("addTask", text);

        // Clear form
        event.target.text.value = "";
      },
      "change .hide-completed input": function (event) {
        Session.set("hideCompleted", event.target.checked);
      }
    });

    Template.task.helpers({
      isOwner: function () {
        return this.owner === Meteor.userId();
      }
    });

    Template.task.events({
      "click .toggle-checked": function () {
        // Set the checked property to the opposite of its current value
        Meteor.call("setChecked", this._id, ! this.checked);
      },
      "click .delete": function () {
        Meteor.call("deleteTask", this._id);
      },
      "click .toggle-private": function () {
        Meteor.call("setPrivate", this._id, ! this.private);
      }
    });

    Accounts.ui.config({
      passwordSignupFields: "USERNAME_ONLY"
    });
  }

  Meteor.methods({
    addTask: function (text) {
      // Make sure the user is logged in before inserting a task
      if (! Meteor.userId()) {
        throw new Meteor.Error("not-authorized");
      }

      Tasks.insert({
        text: text,
        createdAt: new Date(),
        owner: Meteor.userId(),
        username: Meteor.user().username
      });
    },
    deleteTask: function (taskId) {
      var task = Tasks.findOne(taskId);
      if (task.private && task.owner !== Meteor.userId()) {
        // If the task is private, make sure only the owner can delete it
        throw new Meteor.Error("not-authorized");
      }

      Tasks.remove(taskId);
    },
    setChecked: function (taskId, setChecked) {
      var task = Tasks.findOne(taskId);
      if (task.private && task.owner !== Meteor.userId()) {
        // If the task is private, make sure only the owner can check it off
        throw new Meteor.Error("not-authorized");
      }

      Tasks.update(taskId, { $set: { checked: setChecked} });
    },
    setPrivate: function (taskId, setToPrivate) {
      var task = Tasks.findOne(taskId);

      // Make sure only the task owner can make a task private
      if (task.owner !== Meteor.userId()) {
        throw new Meteor.Error("not-authorized");
      }

      Tasks.update(taskId, { $set: { private: setToPrivate } });
    }
  });

  //creating the token and adding to the user
  var stampedToken = Accounts._generateStampedLoginToken();
  Meteor.users.update(userId,
    {$push: {'services.resume.loginTokens': stampedToken}}
  );

  //sending token along with the userId
  return {
    id: userId,
    token: stampedToken.token
  }
});

SearchSource.defineSource('packages', function(searchText, options) {
  var options = {sort: {isoScore: -1}, limit: 20};

  if(searchText) {
    var regExp = buildRegExp(searchText);
    var selector = {$or: [
      {packageName: regExp},
      {description: regExp}
    ]};

    return Packages.find(selector, options).fetch();
  } else {
    return Packages.find({}, options).fetch();
  }
});

function buildRegExp(searchText) {
  // this is a dumb implementation
  var parts = searchText.trim().split(/[ \-\:]+/);
  return new RegExp("(" + parts.join('|') + ")", "ig");
}
