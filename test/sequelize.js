import Sequelize from 'sequelize';

const sequelize = new Sequelize('database', 'test', 'password', {
  dialect: 'sqlite',
  storage: 'test/db.test.sqlite',
  logging: false
});

export default sequelize;
