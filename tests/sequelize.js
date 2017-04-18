import Sequelize from 'sequelize';

const sequelize = new Sequelize('database', 'test', 'password', {
  dialect: 'sqlite',
  storage: 'db.test.sqlite',
  logging: false
});

export default sequelize;
