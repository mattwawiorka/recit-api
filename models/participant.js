const Sequelize = require('sequelize');

const sequelize = require('../util/db');

const Participant = sequelize.define('participant', 
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    byInvite: {
      type: Sequelize.BOOLEAN
    }
  },
  {
    indexes: [
      {
        fields: ['updatedAt']
      }
    ]
  }
);

module.exports = Participant;