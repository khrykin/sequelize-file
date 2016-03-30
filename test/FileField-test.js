import {
  STRING,
  VIRTUAL,
  ValidationError,
  ValidationErrorItem
} from 'sequelize';

import expect from 'expect';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

import sequelize from './sequelize';
import SequelizeFileField, { pathWithSize, getSize } from '../lib/SequelizeFile';

let Model;

const DEFAULT_OPTIONS = {
  virtualAttribute: 'pic',
  mimetype: /image/
};

const TMP_FOLDER = 'public/uploads/sequelize-file-field-tmp';

const FILE = {
  path: `${TMP_FOLDER}/Lenna.png`,
  mimetype: 'image/png'
};

const BAD_FILE = {
  path: `${TMP_FOLDER}/Lenna.png`,
  mimetype: 'application/javascript'
};

const URL = "http://ski-o.ru/img/photo/120316-2_w200.jpg";
const BAD_URL = "http://ski-o.ru";
const NOT_FOUND_URL = "http://ski-o.ru/ooooooooooo";
const INVALID_URL = "htt/ooooooooooo";

function fileExists(path) {
  return new Promise((resolve, reject) => {
    fs.stat('public' + path, (err, stat) => {
      if (err) return reject(err);
      resolve(true)
    });
  });
}

describe('SequelizeFileField', () => {

  describe('attrs', () => {
    before(() => {
      Model = sequelize.define('model', {
        name: STRING,
      });

      return sequelize.sync({ force: true });
    });

    it('shoud return STRING and VIRTUAL fields and set ' +
       'getter on virtual', () => {

      const { attrs }
        = new SequelizeFileField(DEFAULT_OPTIONS);

      expect(attrs.pic)
      .toInclude({
        type: VIRTUAL
      });

      expect(attrs.pic.get)
      .toBeA('function');

      expect(attrs.picPath)
      .toInclude({
        type: STRING(1234),
        allowNull: true
      });
    });

    it('shoud return VIRTUAL field for crop if options.crop is ' +
       'true ', () => {

      const { attrs } = new SequelizeFileField({
        ...DEFAULT_OPTIONS,
        crop: true
      });

      expect(attrs.picCrop)
      .toInclude({ type: VIRTUAL });
    });

  });


  describe('setHooks', () => {
    before(() => {
      const { attrs, addHooksTo }
        = new SequelizeFileField(DEFAULT_OPTIONS);

      Model = sequelize.define('model', {
        name: STRING,
        ...attrs
      });

      addHooksTo(Model);

      return sequelize.sync({ force: true });
    });

    it('should add hooks to Model', () => {
      expect(Model.hasHook('afterCreate'))
      .toEqual(true);
      expect(Model.hasHook('beforeUpdate'))
      .toEqual(true);
      expect(Model.hasHook('beforeDestroy'))
      .toEqual(true);
    });
  });

  describe('behaviour', () => {
    before(done => {
      exec(`mkdir -p ${TMP_FOLDER}`, ( err, stdout, stderr ) => {
        // if (err) console.log(err);
        done();
      });
    });

    after(done => {
      exec(`rm -r ${TMP_FOLDER}`, ( err, stdout, stderr ) => {
        // if (err) console.log(err);
        done();
      });
    });

    beforeEach(done => {
      const testImagePath = path.resolve(__dirname, 'Lenna.png');
      exec(
        `cp ${testImagePath} ` +
        FILE.path, ( err, stdout, stderr ) => {
        // if (err) console.log(err);
        done();
      });
    });

    afterEach(done => {
      exec( 'rm -r public/uploads/models', ( err, stdout, stderr ) => {
        // if (err) console.log(err);
        done();
      });
    });

    describe("when attribute and mimetype are set", () => {

      before(() => {
        const { attrs, addHooksTo }
          = new SequelizeFileField(DEFAULT_OPTIONS);

        Model = sequelize.define('model', {
          name: STRING,
          ...attrs
        });

        addHooksTo(Model);

        return sequelize.sync({ force: true });
      });

      describe("on create", () => {

        it('should set file from url', done => {
          return Model
            .create({ pic: URL })
            .then(instance => {

              expect(instance.pic).toBeA('string');

              fs.stat('public' + instance.pic, (err, stat) => {
                expect(err).toNotExist();
                done();
              });
            });
        });

        it('should set file from object', done => {
          return Model
            .create({ pic: FILE })
            .then(instance => {

              expect(instance.pic).toBeA('string');

              fs.stat('public' + instance.pic, (err, stat) => {
                expect(err).toNotExist();
                done();
              });
            });
        });

        it('shouldn\'t do anything if attribute isn\'t set', () => {
          return Model
            .create({ name: 'Tina' })
            .then(instance => {
              fs.stat(`public/uploads/models/pics/${instance.id}`, (err, stat) => {
                expect(err).toExist();
                expect(err.code).toEqual('ENOENT');
              });
            });
        });
      });

      describe('on update', () => {

        it('should set file from url', (done) => {
          const URL = "http://ski-o.ru/img/photo/120316-3_w200.jpg";
          return Model
            .create({ name: 'Putin' })
            .then(instance => instance.update({ pic: URL }))
            .then(instance => {

              expect(instance.pic).toBeA('string');

              fs.stat('public' + instance.pic, (err, stat) => {
                expect(err).toNotExist();
                done();
              });
            });
        });

        it('should set file from object', (done) => {
          return Model
            .create({ name: 'Putin' })
            .then(instance => instance.update({ pic: FILE }))
            .then(instance => {

              expect(instance.pic).toBeA('string');

              fs.stat('public' + instance.pic, (err, stat) => {
                expect(err).toNotExist();
                done();
              });
            });
        });

        it('shouldn\'t cleanup when cleanup is falsy', done => {
          Model
            .create({ pic: FILE })
            .then(instance => {
              const oldPic = instance.pic;
              instance.update({ pic: URL })
                .then(newInstance => {
                  const newPic = instance.pic;
                  fs.stat('public' + newPic, (err, stat) => {
                    expect(err).toNotExist();
                    fs.stat('public' + oldPic, (err, stat) => {
                      expect(err).toNotExist();
                      done();
                    });
                  });
                })
                .catch(err => expect(err).toNotExist())
                ;
            });
        });

        it('should cleanup when cleanup is true', done => {
          const { attrs, addHooksTo }
            = new SequelizeFileField({
              ...DEFAULT_OPTIONS,
              cleanup: true
            });

          Model = sequelize.define('model', {
            name: STRING,
            ...attrs
          });

          addHooksTo(Model);

          return Model
            .create({ pic: FILE })
            .then(instance => {
              const oldPic = instance.pic;
              instance.update({ pic: URL })
                .then(newInstance => {
                  const newPic = instance.pic;
                  fs.stat('public' + newPic, (err, stat) => {
                    expect(err).toNotExist();
                    fs.stat('public' + oldPic, (err, stat) => {
                      expect(err).toExist();
                      expect(err.code).toEqual('ENOENT');
                      done();
                    });
                  });
                })
                .catch(err => expect(err).toNotExist())
                ;
            });
        });

        it('should delete image if attribute is null', () => {
          return Model
            .create({ pic: FILE })
            .then(instance => {
              fs.stat(instance.pic, (err, stat) => {
                expect(err).toNotExist();
                instance.pic = null
                instance.save()
                  .then(instance => {
                    expect(instance.pic).toNotExist();
                  });
              });
            });
        });


        it('shouldn\'t do anything if attribute isn\'t set', done => {
          return Model
            .create({ pic: FILE })
            .then(instance => {
              return instance.update({ name: 'Tina' })
            })
            .then(instance => {
              expect(instance.pic).toBeA('string');
              fs.stat('public' + instance.pic, (err, stat) => {
                expect(err).toNotExist();
                done()
              });
            });
        });


        it('should throw sequelize error for wrong mimetype ' +
           'when file is url', () => {
          return Model
            .create({ pic: FILE })
            .then(instance => {
              return instance.update({ pic: BAD_URL })
            })
            .then(instance => {
              throw "Promise resolved when it shoudn't";
            })
            .catch(error => {
              expect(error).toBeA(ValidationError);
              expect(error.errors.length).toEqual(1);
              expect(error.errors[0]).toBeA(ValidationErrorItem);
              expect(error.errors[0].path).toEqual('pic');
            });
        });

        it('should throw sequelize error for wrong mimetype ' +
           'when file is object', () => {
           return Model
             .create({ pic: FILE })
             .then(instance => {
               return instance.update({ pic: BAD_FILE })
             })
             .then(instance => {
               throw "Promise resolved when it shoudn't";
             })
             .catch(error => {
               expect(error).toBeA(ValidationError);
               expect(error.errors.length).toEqual(1);
               expect(error.errors[0]).toBeA(ValidationErrorItem);
               expect(error.errors[0].path).toEqual('pic');
             });
        });

        it('should throw sequelize error when file is ' +
           'url and can\'t download', () => {
           let inst;
           return Model
             .create({ pic: FILE })
             .then(instance => {
               inst = instance;
               return instance.update({ pic: NOT_FOUND_URL })
             })
             .then(instance => {
               throw "Promise resolved when it shoudn't";
             })
             .catch(error => {
               expect(error).toBeA(ValidationError);
               expect(error.errors.length).toEqual(1);
               expect(error.errors[0]).toBeA(ValidationErrorItem);
               expect(error.errors[0].path).toEqual('pic');
               return inst.update({ pic: INVALID_URL })
             })
             .catch(error => {
               expect(error).toBeA(ValidationError);
               expect(error.errors.length).toEqual(1);
               expect(error.errors[0]).toBeA(ValidationErrorItem);
               expect(error.errors[0].path).toEqual('pic');
             })
        });

      });



    });

    describe('post-processing', () => {
      before(() => {
        const { attrs, addHooksTo }
          = new SequelizeFileField({
            ...DEFAULT_OPTIONS,
            sizes: {
              small: 64,
              big: "x300"
            }
          });

        Model = sequelize.define('model', {
          name: STRING,
          ...attrs
        });

        addHooksTo(Model);

        return sequelize.sync({ force: true });
      });

      it('should resize file', () => {
        return Model
          .create({ pic: URL })
          .then(instance => {
            expect(instance.picPath).toBeA('string');
            expect(instance.pic).toBeA('object');
            expect(instance.pic).toInclude({
              original: instance.picPath,
              small: pathWithSize(instance.picPath, 'small'),
              big: pathWithSize(instance.picPath, 'big'),
            });

            return fileExists(instance.picPath)
            .then(exists => {
              expect(exists).toEqual(true);
              return fileExists(pathWithSize(instance.picPath, 'small'))
            })
            .then(exists => {
              expect(exists).toEqual(true);
              return getSize('public' + pathWithSize(instance.picPath, 'small'))
              .then(({ width, height }) => {
                expect(width).toEqual(64);
                return fileExists(pathWithSize(instance.picPath, 'big'))
              });
            })
            .then(exists => {
              expect(exists).toEqual(true);
              return getSize('public' + pathWithSize(instance.picPath, 'big'))
              .then(({ width, height }) => {
                expect(height).toEqual(300);
              });
            })
            .catch(err => Promise.reject(err))
            ;
          });
      });
    });

  });

});
