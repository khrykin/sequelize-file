/** @module file-field */

/** @desc
 * Wrapper around sequelize model, provides file attachments management
 * and post-processing
 */

import fs from 'fs';

import {
  STRING,
  VIRTUAL,
  ValidationError,
  ValidationErrorItem
} from "sequelize";

import pluralize from "pluralize";
import request from 'request';
import { typeCheck } from 'type-check';
import graphicsMagick from 'gm';

import mkdirp from 'mkdirp';
import mv from 'mv';
import escapeStringRegexp from 'escape-string-regexp';

const gm = graphicsMagick.subClass({ imageMagick: true });

const DEFAULT_QUALITY = 100;

/**
 * @example
 *  const picture = SequelizeFileField({
 *    attribute: 'picture',
 *    mimetype: /image/,
 *    crop: true,
 *    folderKey: 'slug',
 *    sizes: {
 *      small: 64,
 *      big: "150x350",
 *    }
 *  });
 *
 *  const backgroundImage = SequelizeFileField({
 *    attribute: 'backgroundImage',
 *    mimetype: /image/,
 *    crop: true,
 *    folderKey: 'slug',
 *    sizes: {
 *      preview: "x350"
 *    }
 *  });
 *
 *  let User = sequelize.define('user', {
 *    name: STRING,
 *    ...picture.attrs,
 *    ...backgroundImage.attrs
 *  });
 *
 *  picture.addHooksTo(User);
 *  backgroundImage.addHooksTo(User);
 *
 *  // Url will be downloaded
 *  let user1 = User.build({ picture: "http://example.com/somepic.jpg" });
 *
 *  // Or you can pass multer-style File object, for example
 *  let user2 = User.build({ picture: {
 *       path: '/uploads/tmp/somepic.jpg',
 *       mimetype: 'image/jpeg'
 *    }
 *  });
 *
 */

export default class SequelizeField {

  /**
   * Returns an instance with attrs property and addHookTo(Model) method
   * for given options
   * @param   {Object}  options
   *
   * @param   {String}  options.virtualAttribute - name of attribute from
   *                    which you want to set/access file path(s).
   *                    For example: userpic, image, bg, etc.
   *
   * @param   {String|RegExp}  options.mimetype - allowed MIME type of
   *                    attachments. Example: /^image/
   *
   * @param   {String}  [options.pathAttribute] - name of real db field, where
   *                    original path will be stored
   *
   * @param   {String}  [options.sizes] - object with resize options in format
   *                    of [name]: "{width}x{height}{options}". Only for images.
   *
   * @param   {Boolean} [options.crop] - if true, a new virtual attribute will
   *                    be created to set crop properties. Only for images.
   *
   * @param   {String} [options.basepath='public/uploads'] - Path relative to
   *                    your project, where you want to store processed files.
   *
   * @param   {String} [options.publicPath='public'] - Path fragment relative to
   *                    your project, which you don't want to store in db.
   *
   * @param   {String} [options.folderKey='id'] - Name of attribute, by which
   *                    processed files will be grouped.
   *
   * @param   {String} [options.cleanup=false] - If true, old files will be
   *                    deleted, when you update corresponding field
   *
   * @return  {attrs:Object, addHooksTo:Function}
   */

  constructor({
      virtualAttribute,
      mimetype,
      pathAttribute,
      sizes,
      crop,
      basepath,
      publicPath,
      cleanup,
      folderKey,
      wrongTypeMessage
    }) {
    /* --- VALIDATIONS ---------------------------------------------------- */

    validateType({ virtualAttribute },'String');
    validateType({ pathAttribute },   'String | Undefined');
    validateType({ mimetype },        'String | RegExp');
    validateType({ crop },            'Boolean | Undefined');
    validateType({ cleanup },         'Boolean | Undefined');
    validateType({ folderKey },       'String | Undefined');
    validateType({ sizes },           'Object | String | Undefined');

    if ((crop || sizes ) && !/image/.test(mimetype)) {
      throw new Error(
        'Can\'t set crop or size on non-image mimetype'
      );
    }

    /* --- PRIVATE PROPS -------------------------------------------------- */

    this._VIRTUAL_ATTRIBUTE_NAME = virtualAttribute;
    this._PATH_ATTRIBUTE_NAME    = pathAttribute || `${virtualAttribute}Path`;
    this._CROP_ATTRIBUTE_NAME    = `${this._VIRTUAL_ATTRIBUTE_NAME}Crop`;
    this._MIMETYPE               = mimetype;
    this._SIZES                  = sizes;
    this._CROP_IS_ON             = !!crop;
    this._CLEANUP_IS_ON          = !!cleanup;
    this._PUBLIC_PATH            = publicPath || 'public';
    this._BASEPATH               = basepath || `${this._PUBLIC_PATH}/uploads`;
    this._FOLDER_KEY             = folderKey || 'id';
    this._WRONG_TYPE_MESSAGE     = wrongTypeMessage || "Wrong file's MIME type";

    /* --- PUBLIC PROPS --------------------------------------------------- */

    this.attrs = this._getAttrs();
  }


  /**
   * Sequelize beforeUpdate hook
   * @param {Sequelize.Instance} instance
   * @param {Object} options - Sequelize save options
   * @return {Promise}
   */

  _beforeUpdateHook = (instance, options) => {
    return this._setFile(instance, options)
  };

  /**
   * Sequelize afterCreate hook
   * @param {Sequelize.Instance} instance
   * @param {Object} options - Sequelize save options
   * @return {Promise}
   */

  _afterCreateHook = (instance, options) => {
    return this._setFile(instance, options, true);
  };

  /**
   * Abstract Hook
   * @param {Sequelize.Instance} instance
   * @param {Object} options - Sequelize save options
   * @param {Boolean} afterCreate - if true an extra update will be triggered
   * @return {Promise}
   */

  _setFile(instance, options, afterCreate) {
    const file = instance.getDataValue(this._VIRTUAL_ATTRIBUTE_NAME);

    if (
      ( file && file.updated ) ||
      typeof file === 'undefined'
    ) return ;

    if (this._CLEANUP_IS_ON) {
      this._destroyFileHook(instance, options);
    }

    if (
         typeOf(file)         === 'Object'
      && typeof file.mimetype === 'string'
      && typeof file.path     === 'string'
    ) {

      return this._moveFromTemporary(file, instance)
      .then(file => {
        return this._attachFile(instance, file, afterCreate);
      })
      .catch(err => this._validationError(err));

    } else if (typeof file === 'string') {

      const url = file;
      const foldername = instance.getDataValue(this._FOLDER_KEY);
      const filename
        = `${this._BASEPATH}/${foldername}` +
          `/${nameFromUrl(url)}`;

      return download(url, filename)
      .then(file => {
        return this._attachFile(instance, file, afterCreate);
      })
      .catch(err => this._validationError(err));

    } else if (typeOf(file) === 'Null'){
      instance.setDataValue(this._PATH_ATTRIBUTE_NAME, null);
    }
  }

  /**
   * Returns Promise.reject() with a SequelizeValidationError
   * @param {Error|String} errors
   * @return {Function}
   */

  _validationError(err) {
    let message;
    switch (typeof err) {
      case 'string':
        message = err;
        break;
      case 'object':
        message = err.message;
        break;
    };

    const validationError = new ValidationErrorItem(message,
      null,
      this._VIRTUAL_ATTRIBUTE_NAME
    );

    const error = new ValidationError(message, [validationError]);
    return Promise.reject(error)
  }

  /** Sequelize hook with files deleting logic
   * @param {Sequelize.Instance} instance
   * @param {Object} options
   */

  _destroyFileHook = (instance, options) => {
    if (!this._CLEANUP_IS_ON) return;
    let path = instance.getDataValue(this._PATH_ATTRIBUTE_NAME);
    if (!path) return;

    path = this._fromPublic(path);

    if (this._SIZES) {
       this._forEachSize(this._SIZES, (name, options) => {
        const path = pathWithSize(path, name);
        fs.stat(path, (err, stat) => {
          if (!err) {
            fs.unlink(path);
          }
        });
      });
    } else {
      fs.stat(path, (err, stat) => {
        if (!err) {
          fs.unlink(path);
        }
      });
    }
  };


  /** Returns get method for virtual attribute,
    * @return {Function} getter
    */

  _virtualAttributeGetter() {
    const {
      _SIZES,
      _PATH_ATTRIBUTE_NAME,
      _forEachSize
    } = this;

    if (_SIZES) {
      return function () {
        const path = this.getDataValue(_PATH_ATTRIBUTE_NAME);
        if (!path) return undefined;
        let output = {
          original: path
        };
        path && _forEachSize(_SIZES, (size, name, options) => {
          output[name] = pathWithSize(path, name);
        });
        return output;
      };
    }
    return function () {
      return this.getDataValue(_PATH_ATTRIBUTE_NAME);
    };
  }


  /** Returns an object with required attributes: [name]: VIRTUAL,
    * [name]Path:STRING(1234) and [name]Crop: VIRTUAL, if constructor's
    * options.crop is true
    * @return {Object}
    */

  _getAttrs() {
    let obj = {
      [this._VIRTUAL_ATTRIBUTE_NAME]: {
        type: VIRTUAL,
        get: this._virtualAttributeGetter()
      },
      [this._PATH_ATTRIBUTE_NAME]: {
        type: STRING(1234),
        allowNull: true
      }
    };
    if (this._CROP_IS_ON) {
      obj[this._CROP_ATTRIBUTE_NAME] = {
        type: VIRTUAL
      };
    };
    return obj;
  }


  /** Moves file to instance's directory
   * @param {Object} file
   * @param {String} file.path
   * @param {String} basepath
   * @return {Promise<File, error>}
   */

  _moveFromTemporary(file, instance) {
    const { path } = file;
    return new Promise((resolve, reject) => {

      const instancePath = `${this._BASEPATH.replace(/\/$/, '')}` +
       `/${instance.getDataValue(this._FOLDER_KEY)}`;
      const newPath = instancePath +
       `/${nameFromUrl(path)}` ;

      return createDir(instancePath)
        .then(instancePath => {
          mv(path, newPath, err => {
            if (err) return reject(err);

            resolve({
              ...file,
              path: newPath
            });
          });
        })
        .catch(err => {
          reject(err)
        });
    });
  }


  /** Recizes image and crops it if constructor's options.crop is true;
   * @param {Sequelize.Instance} instance
   * @param {Object} file
   * @param {String} file.path
   * @return {Promise<Object, Error>} promise which resolves with size object
   */

  _processImage(instance, file) {
    return getSize(file.path)
    .then(({ width, height }) => {
      let gmi = gm(file.path);
      if (this._CROP_IS_ON && crop) {
        let crop = getDataValue(this._CROP_ATTRIBUTE_NAME);
        /** Crop's props are implied to be in percents
         * - we need absolutes
         */
        crop = {
          width:  width   *  crop.width,
          height: height  *  crop.height,
          x:      width   *  crop.x,
          y:      height  *  crop.y,
        };

        gmi = gmi.crop(crop);
      }
      return this._resizeAll(gmi, file.path)
    });
  };


  /** Sets file path to instance's path attribute
   * @param {Object} instance - sequelize instance
   * @param {Object} file
   * @param {String} file.path
   * @param {String} file.mimetype
   * @return {Promise<, Error> | undefined}
   */

  _attachFile(instance, file, afterCreate) {
      if (!new RegExp(this._MIMETYPE).test(file.mimetype)) {

        /* Remove bad temporary */
        fs.stat(file.path, (err, stat) => {
          if (!err) {
            fs.unlink(file.path);
          }
        });

        reject(
          new Error(
            this._WRONG_TYPE_MESSAGE || `Wrong file MIME type: ` +
            `should be ${mimetype}, but got ${file.type}`
          )
        );
      }

      const isImage = /image/.test(file.mimetype);

      let promise = new Promise((resolve) => {
        instance.setDataValue(
          this._PATH_ATTRIBUTE_NAME,
          this._publicPath(file.path)
        );
        resolve(instance);
      });

      if (afterCreate) {
        promise = instance.update({
          [this._PATH_ATTRIBUTE_NAME]: this._publicPath(file.path)
        });
      }

      instance.setDataValue(
        this._VIRTUAL_ATTRIBUTE_NAME,
        { updated: true }
      );

      return promise
      .then(instance => {
        if (this._SIZES && isImage) {
          return this._processImage(instance, file)
        }
      })
  };


  /** Iterates through sizes and resizes with Promise.all
   * @param {Object} gm - gm instance, ex. gm('img.jpg')
   * @param {Object} instance - sequelize instance
   * @param {String} path
   * @return {Promise<object, Error>} promise which resolves with size object
   */

  _resizeAll(gm, path) {
     let promises = [];
      this._forEachSize(this._SIZES, (size, name, options) => {
       promises.push(
         resize(gm, path, name, size, options.quality)
       );
     });
     return Promise.all(promises);
   };


   /**
    * Iterates over sizes object
    * @param {Object} sizes
    * @param {function(size: String, name: String, options: Object)} cb
    */

   _forEachSize(sizes, cb) {
     for (let key in sizes) {
       let options = sizes[key];
       let size = typeof options === 'object' ? size.size : options;
       if (typeof options === 'string') options = {}
       // size = Number(size);
       cb(size, key, options);
     };
   };


   /** Get path relative to public folder
    * @param {String} path - path in package folder, ex. public/uplods
    * @return {String} publicPath - path in public folder, ex. /uploads
    */

   _publicPath(path) {
     return path.replace(
       new RegExp('^' +
         escapeStringRegexp(this._PUBLIC_PATH)
       ), '');
   }

   /** Get path relative to package folder
    * @param {String} path - path in public folder with leading root,
    *                        ex. /uploads
    * @return {String} publicPath - path in package folder, ex. public/uplods
    */

   _fromPublic(path) {
     return `${this._PUBLIC_PATH}${path}`;
   }


  /* --- PUBLIC API ------------------------------------------------------- */


  /** Sets neccesary hooks on Model
   * @param {Sequelize.Model} Model
   */

  addHooksTo = (Model) => {
    const {
      _VIRTUAL_ATTRIBUTE_NAME,
      _PATH_ATTRIBUTE_NAME,
      _CROP_IS_ON,
      _CROP_ATTRIBUTE_NAME,

      _PUBLIC_PATH,
     } = this;

    const modelFolder = `${pluralize(Model.name.toLowerCase())}` +
    `/${pluralize(_VIRTUAL_ATTRIBUTE_NAME.toLowerCase())}`;

    this._BASEPATH = `${this._BASEPATH}/${modelFolder}`;

    if (!Model.attributes[_VIRTUAL_ATTRIBUTE_NAME]) {
      throw new Error(
        `Can\'t find ${_VIRTUAL_ATTRIBUTE_NAME} in ${Model.name}'s attributes`
      );
    }

    if (!Model.attributes[_PATH_ATTRIBUTE_NAME]) {
      throw new Error(
        `Can\'t find ${_PATH_ATTRIBUTE_NAME} in ${Model.name}'s attributes`
      );
    }

    if (_CROP_IS_ON && !_Model.attributes[_CROP_ATTRIBUTE_NAME]) {
      throw new Error(
        `Can\'t find ${_CROP_ATTRIBUTE_NAME} in ${Model.name}'s attributes`
      );
    }

    Model.afterCreate(this._afterCreateHook);
    Model.beforeUpdate(this._beforeUpdateHook);
    Model.beforeDestroy(this._destroyFileHook);
  };

}


/**
 * gm Promise wrappers
 */

/** Promise wrapper for gm.size
 * @param {String} path
 * @return {Promise<object, Error>} promise which resolves with size object
 */

 export function getSize(path) {
   return new Promise((resolve, reject) => {
    gm(path)
    .size((err, size) => {
      if (err) {
        return reject(err);
      }
      resolve(size);
    });
  });
 }


/** Promise wrapper for gm.size.quality.write chain
 * @param {Object} gm - gm instance, ex. gm('img.jpg')
 * @param {String} path
 * @param {String} name - will be placed with low dash before file's extension
 * @param {String|Number} size
 * @param {Number} quality
 * @return {Promise<object, Error>} promise which resolves with filename
 */

function resize(gm, path, name, size, quality=DEFAULT_QUALITY) {
  return new Promise((resolve, reject) => {
    const filename = name ? pathWithSize(path, name) : path;
    const { width, height, options } = parseSize(size);
    gm
      .resize(width, height, options)
      .quality(quality)
      .write(filename, err => {
        if (err) {
          return reject(err);
        }
        return resolve(filename);
      });
  });
}

/** Parses string of format "[width]x[height][options]" into object
 * @param {String}
 * @return {Object}
 */

function parseSize(str) {
  const result = String(str).match(/(\d+)?x?(\d+)?(.+)?/);
  return {
    width: result[1],
    height: result[2],
    options: result[3]
  }
}

/**
 * Utility functions
 */

function typeOf(entity) {
  return Object.prototype
    .toString
    .call(entity)
    .match(/(\w+)\]/)[1]
}

function getType(entity) {
  const type = typeOf(entity)
  return type === 'Object' ? `[object Object] { ${
    Object
    .keys(entity)
    .map(key => `${key}: ${typeOf(entity[key])}`)
    .join(',\n')
  } }` : type;
}

function validateType(obj, type) {
  const name = Object.keys(obj)[0];
  const entity = obj[name];
  let valid = typeCheck(type, entity);
  if (!valid) {
    throw new TypeError(
      `Expected ${name} to be of type ${type},` +
      ` but got ${getType(entity)}`
    );
  }
  return valid;
}

function download(url, path) {
  return new Promise((resolve, reject) => {
    request.head(url, (err, res, body) => {
      if (err) return reject(err);

      if (res.statusCode < 200 || res.statusCode >= 400 ) {
        reject(
          `Can't download resource: "${url}" responded with ` +
          `"${res.statusCode}: ${res.statusMessage}"`
        );
      }

      const mimetype = res.headers['content-type'];
      const basepath = path.match(/(.+)(\/.+)$/)[1];

      mkdirp(basepath, err => {
        if (err) return reject(err);
        request(url)
          .pipe(fs.createWriteStream(path))
          .on('close', () => resolve({ mimetype, path }));
      });
    });
  });
}

function nameFromUrl(url) {
  return url.match(/\/([^\/]+)$/)[1];
}

export function pathWithSize(path, size) {
  if (typeof path !== 'string') {
    throw new TypeError(`Path must be a string, but got ${typeof path}`);
  }
  return `${path.replace(/(.+)(\..+)$/, '$1_' + size + '$2')}`
}

function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.substr(1)
}

function createDir(path) {
  return new Promise((resolve, reject) => {
    fs.stat(path, (err, stat) => {
      if (err && err.code === 'ENOENT') {
        mkdirp(path, err => {
          if (err) return reject(err);
          return resolve(path);
        });
      } else {
        resolve(path);
      }
    });
  });
}
