const Sequelize = require('sequelize');

const sequelize = require('../util/db');

const fs = require('fs');

const User = sequelize.define('user', 
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: Sequelize.STRING
    },
    // "Jersey Number" used to differentiate users with the same name
    // Could also be used in the future to generate default profile pic
    number: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 00
    },
    facebookId: {
      type: Sequelize.STRING
    },
    phoneNumber: {
      type: Sequelize.STRING
    },
    phoneCode: {
      type: Sequelize.INTEGER
    },
    verified: {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    },
    dob: {
      type: Sequelize.DATE  
    },
    gender: {
      type: Sequelize.STRING
    },
    status: {
      type: Sequelize.STRING,
      defaultValue: "Let's Play!"
    },
    profilePic: {
      type: Sequelize.STRING,
      defaultValue: 'http://localhost:8080/images/profile-blank.png'
    },
    pic1: {
      type: Sequelize.STRING,
      defaultValue: 'http://localhost:8080/images/profile-blank.png'
    },
    pic2: {
      type: Sequelize.STRING,
      defaultValue: 'http://localhost:8080/images/profile-blank.png'
    },
    pic3: {
      type: Sequelize.STRING,
      defaultValue: 'http://localhost:8080/images/profile-blank.png'
    },
    loginLocation: {
      type: Sequelize.GEOMETRY('POINT', 4326),
    },
    city: {
      type: Sequelize.STRING
    }
  },
  {
    hooks: {
      // After updating pics, remove old ones from the server
      afterUpdate: (user) => {
        // If pic is changed check if that pic is used elsewhere, if not - delete
        if (user.changed('profilePic')) {
          if (Object.values(user.dataValues).indexOf(user.previous('profilePic')) < 0) {
            fs.unlink(user.previous('profilePic').split('8080')[1], err => console.log(err))
          }
        }
        if (user.changed('pic1')) {
          if (Object.values(user.dataValues).indexOf(user.previous('pic1')) < 0) {
            fs.unlink('images/' + user.id + '/' + user.previous('pic1').split('/')[5], err => console.log(err))
          }
        }
        if (user.changed('pic2')) {
          if (Object.values(user.dataValues).indexOf(user.previous('pic2')) < 0) {
            fs.unlink(user.previous('pic2').split('8080')[1], err => console.log(err))
          }
        }
        if (user.changed('pic3')) {
          if (Object.values(user.dataValues).indexOf(user.previous('pic3')) < 0) {
            fs.unlink(user.previous('pic3').split('8080')[1], err => console.log(err))
          }
        }
      }
    }
  }
);

module.exports = User;