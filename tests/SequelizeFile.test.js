import {
  STRING,
  VIRTUAL,
  ValidationError,
  ValidationErrorItem
} from 'sequelize';

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

import sequelize from './sequelize';
import SequelizeFileField, { pathWithSize, getSize } from '../src/SequelizeFile';

let Model;

const DEFAULT_OPTIONS = {
  virtualAttribute: 'pic',
  mimetype: /image/
};

const TMP_FOLDER = 'public/uploads/sequelize-file-field-tmp';
const TEST_IMAGE_PATH = path.resolve(__dirname, 'Lenna.png');

const FILE = {
  path: `${TMP_FOLDER}/Lenna.png`,
  mimetype: 'image/png'
};

const BAD_FILE = {
  path: `${TMP_FOLDER}/Lenna.png`,
  mimetype: 'application/javascript'
};

const URL = "http://ski-o.ru/img/photo/120316-1.jpg";
const URL2 = "http://ski-o.ru/img/photo/120316-2.jpg";
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


  describe('addTo', () => {
    beforeAll(() => {
      const { addTo }
        = new SequelizeFileField(DEFAULT_OPTIONS);

      Model = sequelize.define('model', {
        name: STRING
      });

      addTo(Model);

      return sequelize.sync({ force: true });
    });


    it('should add STRING and VIRTUAL fields and set ' +
       'getter on virtual', () => {

      expect(Model.attributes.pic)
      .toBeDefined();

      expect(typeof Model.attributes.pic.get)
      .toBe('function');

      expect(Model.attributes.picPath)
      .toBeDefined();
    });

    it('should add VIRTUAL field for crop if options.crop is ' +
       'true ', () => {

      const { addTo } = new SequelizeFileField({
        ...DEFAULT_OPTIONS,
        crop: true
      });

      Model = sequelize.define('model', {
        name: STRING
      });

      addTo(Model);

      expect(Model.attributes.picCrop)
      .toBeDefined();
    });

    it('should add hooks to Model', () => {
      expect(Model.hasHook('afterCreate'))
      .toBeTruthy();
      expect(Model.hasHook('beforeUpdate'))
      .toBeTruthy();
      expect(Model.hasHook('beforeDestroy'))
      .toBeTruthy();
    });

  });

  describe('File management', () => {
    beforeAll(() => new Promise((resolve, reject) => {
      exec(`mkdir -p ${TMP_FOLDER}`, err => {
        if (err) return reject(err);
        resolve();
      });
    }));

    afterAll(() => new Promise((resolve, reject) => {
      exec(`rm -r ${TMP_FOLDER}`, err => {
        if (err) return reject(err);
        resolve();
      });
    }));

    beforeEach(() => new Promise((resolve, reject) => {
      exec(`cp ${TEST_IMAGE_PATH} ${FILE.path}`, err => {
        if (err) return reject(err);
        resolve();
      });
    }));

    afterEach(() => new Promise((resolve, reject) => {
      exec( 'rm -r public/uploads/models', err => {
        resolve();
      });
    }));





    describe("when attribute and mimetype are set", () => {

      beforeAll(() => {
        const { addTo }
          = new SequelizeFileField(DEFAULT_OPTIONS);

        Model = sequelize.define('model', {
          name: STRING,
        });

        addTo(Model);

        return sequelize.sync({ force: true });
      });

      describe("on create", () => {

        it('should set file from url', () => {
          return Model
            .create({ pic: URL })
            .then(instance => instance.reload())
            .then(instance => {
              expect(typeof instance.pic).toBe('string');
              return fileExists(instance.pic)
            })
            .then(exists => expect(exists).toEqual(true))
            .catch(err => Promise.reject(err))
            ;
        });

        it('should set file from object', () => {
          return Model
            .create({ pic: FILE })
            .then(({ id }) => Model.findById(id))
            .then(instance => {
              expect(typeof instance.pic).toBe('string');
              return fileExists(instance.pic)
            })
            .catch(err => Promise.reject(err))
            ;
        });

        it('shouldn\'t do anything if attribute isn\'t set', (done) => {
          return Model
            .create({ name: 'Tina' })
            .then(instance => instance.reload())
            .then(instance => {
              fs.stat(`public/uploads/models/pics/${instance.id}`, (err, stat) => {
                expect(err).toBeDefined();
                expect(err.code).toBe('ENOENT');
                done();
              });
            });
        });
      });

      describe('on update', () => {

        it('should set file from url', () => {
          const URL = "http://ski-o.ru/img/photo/120316-3_w200.jpg";
          return Model
            .create({ name: 'Jim', pic: FILE })
            .then(instance => instance.update({ pic: URL }))
            .then(({ id }) => Model.findById(id))
            .then(instance => {
              expect(typeof instance.pic).toBe('string');
              return fileExists(instance.pic)
            })
            .then(exists => expect(exists).toEqual(true))
            .catch(err => Promise.reject(err))
            ;
        });

        it('should set file from object', (done) => {
          return Model
            .create({ name: 'Putin' })
            .then(instance => instance.update({ pic: FILE }))
            .then(({ id }) => Model.findById(id))
            .then(instance => {

              expect(typeof instance.pic).toBe('string');

              fs.stat('public' + instance.pic, (err, stat) => {
                expect(err).toBeFalsy();
                done();
              });
            })
            .catch(err => Promise.reject(err))
            ;
        });

        it('should replace old file created from url to new destination when ' +
           'updated via file object', (done) => {
          return Model
            .create({ pic: URL })
            .then(instance => instance.update({ pic: FILE }))
            .then(({ id }) => Model.findById(id))
            .then(instance => {

              expect(typeof instance.pic).toBe('string');
              expect(instance.pic).toMatch('Lenna');

              fs.stat('public' + instance.pic, (err, stat) => {
                expect(err).toBeFalsy();
                done();
              });
            })
            .catch(err => Promise.reject(err))
            ;
        });

        it('should replace old file created from file object to new destination when ' +
           'updated via url', (done) => {
          return Model
            .create({ pic: URL })
            .then(instance => instance.update({ pic: URL2 }))
            .then(({ id }) => Model.findById(id))
            .then(instance => {

              expect(typeof instance.pic).toBe('string');
              expect(instance.pic).toMatch('120316-2');

              fs.stat('public' + instance.pic, (err, stat) => {
                expect(err).toBeFalsy();
                done();
              });
            })
            .catch(err => Promise.reject(err))
            ;
        });

        it('shouldn\'t cleanup when cleanup is falsy', done => {
          Model
            .create({ pic: FILE })
            .then(({ id }) => Model.findById(id))
            .then(instance => {
              const oldPic = instance.pic;
              console.log('oldPic', oldPic);
              instance.update({ pic: URL })
                .then(newInstance => {
                  const newPic = instance.pic;
                  console.log('newPic', newPic);

                  fs.stat('public' + newPic, (err, stat) => {
                    expect(err).toBeFalsy();
                    fs.stat('public' + oldPic, (err, stat) => {
                      expect(err).toBeFalsy();
                      done();
                    });
                  });
                })
                .catch(err => Promise.reject(err))
                ;
            });
        });

        it('should cleanup when cleanup is true', done => {
          const { addTo }
            = new SequelizeFileField({
              ...DEFAULT_OPTIONS,
              cleanup: true
            });

          Model = sequelize.define('model', {
            name: STRING,
          });

          addTo(Model);

          return Model
            .create({ pic: FILE })
            .then(({ id }) => Model.findById(id))
            .then(instance => {
              const oldPic = instance.pic;
              instance.update({ pic: URL })
                .then(({ id }) => Model.findById(id))
                .then(newInstance => {
                  const newPic = instance.pic;
                  fs.stat('public' + newPic, (err, stat) => {
                    expect(err).toBeFalsy();
                    fs.stat('public' + oldPic, (err, stat) => {
                      expect(err).toBeDefined();
                      expect(err.code).toBe('ENOENT');
                      done();
                    });
                  });
                })
                .catch(err => Promise.reject(err))
                ;
            });
        });

        it('should delete file attribute if new value is null', () => {
          return Model
            .create({ pic: FILE })
            .then()
            .then(({ id }) => Model.findById(id))
            .then(instance => {
              return fileExists(instance.pic)
              .then(exists => {
                instance.pic = null;
                return instance.save()
                  .then(({ id }) => Model.findById(id))
                  .then(instance => {
                    expect(instance.pic).toBeFalsy();
                  })
                  .catch(err => Promise.reject(err));
              })
              .catch(err => Promise.reject(err));
            });
        });


        it('shouldn\'t do anything if attribute isn\'t set', done => {
          return Model
            .create({ pic: FILE })
            .then(({ id }) => Model.findById(id))
            .then(instance => {
              return instance.update({ name: 'Tina' })
            })
            .then(instance => {
              expect(typeof instance.pic).toBe('string');
              fs.stat('public' + instance.pic, (err, stat) => {
                expect(err).toBeFalsy();
                done()
              });
            });
        });


        it('should throw sequelize error for wrong mimetype ' +
           'when file is url', () => {
          return Model
            .create({ pic: FILE })
            .then(({ id }) => Model.findById(id))
            .then(instance => {
              return instance.update({ pic: BAD_URL })
            })
            .then(instance => {
              throw "Promise resolved when it shoudn't";
            })
            .catch(error => {
              expect(error).toBeInstanceOf(ValidationError);
              expect(error.errors.length).toBe(1);
              expect(error.errors[0]).toBeInstanceOf(ValidationErrorItem);
              expect(error.errors[0].path).toBe('pic');
            });
        });

        it('should throw sequelize error for wrong mimetype ' +
           'when file is object', () => {
           return Model
             .create({ pic: FILE })
             .then(({ id }) => Model.findById(id))
             .then(instance => {
               return new Promise((resolve, reject) => {
                 exec(`cp ${TEST_IMAGE_PATH} ${FILE.path}`, err => {
                   resolve();
                 });
               })
               .then(() => instance.update({ pic: BAD_FILE }));
             })
             .then(instance => {
               throw "Promise resolved when it shoudn't";
             })
             .catch(error => {
               expect(error).toBeInstanceOf(ValidationError);
               expect(error.errors.length).toBe(1);
               expect(error.errors[0]).toBeInstanceOf(ValidationErrorItem);
               expect(error.errors[0].path).toBe('pic');
             });
        });

        it('should throw sequelize error when file is set by' +
           'url and can\'t be downloaded', () => {
           let inst;
           return Model
             .create({ pic: FILE })
             .then(({ id }) => Model.findById(id))
             .then(instance => {
               inst = instance;
               return instance.update({ pic: NOT_FOUND_URL })
             })
             .then(instance => {
               throw "Promise resolved when it shoudn't";
             })
             .catch(error => {
               expect(error).toBeInstanceOf(ValidationError);
               expect(error.errors.length).toBe(1);
               expect(error.errors[0]).toBeInstanceOf(ValidationErrorItem);
               expect(error.errors[0].path).toBe('pic');
               expect(error.errors[0].message).toMatch('404: Not Found')
               return inst.update({ pic: INVALID_URL })
             })
             .catch(error => {
               expect(error).toBeInstanceOf(ValidationError);
               expect(error.errors.length).toBe(1);
               expect(error.errors[0]).toBeInstanceOf(ValidationErrorItem);
               expect(error.errors[0].path).toBe('pic');
             })
          });
      });
    });

    describe('post-processing', () => {
      beforeAll(() => {
        const { addTo }
          = new SequelizeFileField({
            ...DEFAULT_OPTIONS,
            sizes: {
              small: 64,
              big: "x300"
            }
          });

        Model = sequelize.define('model', {
          name: STRING
        });

        addTo(Model);

        return sequelize.sync({ force: true });
      });

      it('should resize', () => {
        return Model
          .create({ pic: URL })
          .then(({ id }) => {
            return Model.findById(id);
          })
          .then(instance => {
            expect(typeof instance.picPath).toBe('string');
            expect(typeof instance.pic).toBe('object');
            expect(instance.pic).toEqual({
              original: instance.picPath,
              small: pathWithSize(instance.picPath, 'small'),
              big: pathWithSize(instance.picPath, 'big'),
            });

              return fileExists(instance.pic.original)
              .then(exists => {
                expect(exists).toBeTruthy();
                return fileExists(pathWithSize(instance.picPath, 'small'))
              })
              .then(exists => {
                expect(exists).toBeTruthy();
                return getSize('public' + pathWithSize(instance.picPath, 'small'))
              })
              .then(({ width, height }) => {
                expect(width).toBe(64);
                return fileExists(pathWithSize(instance.picPath, 'big'))
              })
              .then(exists => {
                expect(exists).toBeTruthy();
                return getSize('public' + pathWithSize(instance.picPath, 'big'))
              })
              .then(({ width, height }) => {
                expect(height).toBe(300);
              })
              .catch(err => Promise.reject(err))
            })
            .catch(err => Promise.reject(err))
            ;
      });

      it('should crop when crop attribute is set', () => {
        const { addTo }
          = new SequelizeFileField({
            ...DEFAULT_OPTIONS,
            sizes: {
              small: 64,
              big: "x300"
            },
            crop: true
          });

        Model = sequelize.define('model', {
          name: STRING,
        });

        addTo(Model);
        return Model
          .create({
            pic: URL,
            picCrop: {
              x: 0.5,
              y: 0.5,
              width: 0.5,
              height: 0.5
            }
          })
          .then(({ id }) => {
            return Model.findById(id);
          })
          .then(instance => {
            expect(typeof instance.picPath).toBe('string');
            expect(typeof instance.pic).toBe('object');
            expect(instance.pic).toEqual({
              original: instance.picPath,
              small: pathWithSize(instance.picPath, 'small'),
              big: pathWithSize(instance.picPath, 'big'),
            });

              return fileExists(instance.pic.original)
              .then(exists => {
                expect(exists).toBeTruthy();
                return fileExists(pathWithSize(instance.picPath, 'small'))
              })
              .then(exists => {
                expect(exists).toBeTruthy();
                return getSize('public' + pathWithSize(instance.picPath, 'small'))
              })
              .then(({ width, height }) => {
                expect(width).toBe(64);
                return fileExists(pathWithSize(instance.picPath, 'big'))
              })
              .then(exists => {
                expect(exists).toBeTruthy();
                return getSize('public' + pathWithSize(instance.picPath, 'big'))
              })
              .then(({ width, height }) => {
                expect(height).toBe(300);
              })
              .catch(err => Promise.reject(err))
            })
            .catch(err => Promise.reject(err))
            ;

      });

      it('should crop when crop attribute isn\'t set', () => {
        const { addTo }
          = new SequelizeFileField({
            ...DEFAULT_OPTIONS,
            sizes: {
              small: 64,
              big: "x300"
            },
            crop: true
          });

        Model = sequelize.define('model', {
          name: STRING,
        });

        addTo(Model);
        return Model
          .create({
            pic: URL
          })
          .then(({ id }) => {
            return Model.findById(id);
          })
          .then(instance => {
            expect(typeof instance.picPath).toBe('string');
            expect(typeof instance.pic).toBe('object');
            expect(instance.pic).toEqual({
              original: instance.picPath,
              small: pathWithSize(instance.picPath, 'small'),
              big: pathWithSize(instance.picPath, 'big'),
            });

              return fileExists(instance.pic.original)
              .then(exists => {
                expect(exists).toBeTruthy();
                return fileExists(pathWithSize(instance.picPath, 'small'))
              })
              .then(exists => {
                expect(exists).toBeTruthy();
                return getSize('public' + pathWithSize(instance.picPath, 'small'))
              })
              .then(({ width, height }) => {
                expect(width).toBe(64);
                return fileExists(pathWithSize(instance.picPath, 'big'))
              })
              .then(exists => {
                expect(exists).toBeTruthy();
                return getSize('public' + pathWithSize(instance.picPath, 'big'))
              })
              .then(({ width, height }) => {
                expect(height).toBe(300);
              })
              .catch(err => Promise.reject(err))
            })
            .catch(err => Promise.reject(err))
            ;

      });

    });


    it("shouldn't group files by folderKey if folderKey is null", () => {
      const { addTo }
        = new SequelizeFileField({
          ...DEFAULT_OPTIONS,
          folderKey: null
        });

      let Model = sequelize.define('model', {
        name: STRING,
      });

      addTo(Model);

      return sequelize.sync({ force: true })
      .then(() => {
        return Model
          .create({ pic: FILE })
          .then(instance => instance.reload())
          .then(instance => {
            expect(typeof instance.pic).toBe('string');
            expect(instance.pic).toMatch('/models/pics/Lenna')
            expect(instance.pic).not.toMatch('/models/pics/Lenna.png')

          })
      });

    });


    it("shouldn't group files by attribute name and folderKey if " +
       "groupByAttribute is false", () => {

      const { addTo }
        = new SequelizeFileField({
          ...DEFAULT_OPTIONS,
          groupByAttribute: false
        });

      let Model = sequelize.define('model', {
        name: STRING,
      });

      addTo(Model);

      return sequelize.sync({ force: true })
      .then(() => {
        return Model
          .create({ pic: FILE })
          .then(instance => instance.reload())
          .then(instance => {
            expect(typeof instance.pic).toBe('string');
            expect(instance.pic).toMatch('/models/Lenna')
            expect(instance.pic).not.toMatch('/models/Lenna.png')
          })
      });
    });

  });
});
