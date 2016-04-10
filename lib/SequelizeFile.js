"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })(); /** @module file-field */

/** @desc
 * Wrapper around sequelize model, provides file attachments management
 * and post-processing
 */

exports.getSize = getSize;
exports.pathWithSize = pathWithSize;

var _fs = require("fs");

var _fs2 = _interopRequireDefault(_fs);

var _sequelize = require("sequelize");

var _pluralize = require("pluralize");

var _pluralize2 = _interopRequireDefault(_pluralize);

var _request = require("request");

var _request2 = _interopRequireDefault(_request);

var _typeCheck = require("type-check");

var _gm = require("gm");

var _gm2 = _interopRequireDefault(_gm);

var _mkdirp = require("mkdirp");

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _mv = require("mv");

var _mv2 = _interopRequireDefault(_mv);

var _escapeStringRegexp = require("escape-string-regexp");

var _escapeStringRegexp2 = _interopRequireDefault(_escapeStringRegexp);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _typeof(obj) { return obj && typeof Symbol !== "undefined" && obj.constructor === Symbol ? "symbol" : typeof obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var gm = _gm2.default.subClass({ imageMagick: true });

var DEFAULT_QUALITY = 100;

var SequelizeField = (function () {

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
   * @return  { addTo:Function } - Instance with addTo method
   */

  function SequelizeField(_ref) {
    var _this = this;

    var virtualAttribute = _ref.virtualAttribute;
    var mimetype = _ref.mimetype;
    var pathAttribute = _ref.pathAttribute;
    var sizes = _ref.sizes;
    var crop = _ref.crop;
    var basepath = _ref.basepath;
    var publicPath = _ref.publicPath;
    var cleanup = _ref.cleanup;
    var folderKey = _ref.folderKey;
    var wrongTypeMessage = _ref.wrongTypeMessage;

    _classCallCheck(this, SequelizeField);

    this._beforeUpdateHook = function (instance, options) {
      return _this._setFile(instance, options);
    };

    this._afterCreateHook = function (instance, options) {
      return _this._setFile(instance, options, true);
    };

    this._destroyFileHook = function (instance, options) {
      if (!_this._CLEANUP_IS_ON) return;
      var path = instance.getDataValue(_this._PATH_ATTRIBUTE_NAME);
      if (!path) return;

      var original = _this._fromPublic(path);

      if (_this._SIZES) {
        _this._forEachSize(_this._SIZES, function (size, name, options) {
          var path = pathWithSize(original, name);
          _fs2.default.stat(path, function (err, stat) {
            if (!err) {

              _fs2.default.unlink(path);
            }
          });
        });
      }

      _fs2.default.stat(original, function (err, stat) {
        if (!err) {
          _fs2.default.unlink(original);
        }
      });
    };

    this._addHooksTo = function (Model) {
      var _VIRTUAL_ATTRIBUTE_NAME = _this._VIRTUAL_ATTRIBUTE_NAME;
      var _PATH_ATTRIBUTE_NAME = _this._PATH_ATTRIBUTE_NAME;
      var _CROP_IS_ON = _this._CROP_IS_ON;
      var _CROP_ATTRIBUTE_NAME = _this._CROP_ATTRIBUTE_NAME;
      var _PUBLIC_PATH = _this._PUBLIC_PATH;

      var modelFolder = "" + (0, _pluralize2.default)(Model.name.toLowerCase()) + ("/" + (0, _pluralize2.default)(_VIRTUAL_ATTRIBUTE_NAME.toLowerCase()));

      _this._BASEPATH = _this._BASEPATH + "/" + modelFolder;

      if (!Model.attributes[_VIRTUAL_ATTRIBUTE_NAME]) {
        throw new Error("Can't find " + _VIRTUAL_ATTRIBUTE_NAME + " in " + Model.name + "'s attributes");
      }

      if (!Model.attributes[_PATH_ATTRIBUTE_NAME]) {
        throw new Error("Can't find " + _PATH_ATTRIBUTE_NAME + " in " + Model.name + "'s attributes");
      }

      if (_CROP_IS_ON && !Model.attributes[_CROP_ATTRIBUTE_NAME]) {
        throw new Error("Can't find " + _CROP_ATTRIBUTE_NAME + " in " + Model.name + "'s attributes");
      }

      Model.afterCreate(_this._afterCreateHook);
      Model.beforeUpdate(_this._beforeUpdateHook);
      Model.beforeDestroy(_this._destroyFileHook);
    };

    this.addTo = function (Model) {
      _this._addAttrsTo(Model);
      _this._addHooksTo(Model);
    };

    /* --- VALIDATIONS ---------------------------------------------------- */

    validateType({ virtualAttribute: virtualAttribute }, 'String');
    validateType({ pathAttribute: pathAttribute }, 'String | Undefined');
    validateType({ mimetype: mimetype }, 'String | RegExp');
    validateType({ crop: crop }, 'Boolean | Undefined');
    validateType({ cleanup: cleanup }, 'Boolean | Undefined');
    validateType({ folderKey: folderKey }, 'String | Undefined');
    validateType({ sizes: sizes }, 'Object | String | Undefined');

    if ((crop || sizes) && !/image/.test(mimetype)) {
      throw new Error('Can\'t set crop or size on non-image mimetype');
    }

    /* --- PRIVATE PROPS -------------------------------------------------- */

    this._VIRTUAL_ATTRIBUTE_NAME = virtualAttribute;
    this._PATH_ATTRIBUTE_NAME = pathAttribute || virtualAttribute + "Path";
    this._CROP_ATTRIBUTE_NAME = this._VIRTUAL_ATTRIBUTE_NAME + "Crop";
    this._MIMETYPE = mimetype;
    this._SIZES = sizes;
    this._CROP_IS_ON = !!crop;
    this._CLEANUP_IS_ON = !!cleanup;
    this._PUBLIC_PATH = publicPath || 'public';
    this._BASEPATH = basepath || this._PUBLIC_PATH + "/uploads";
    this._FOLDER_KEY = folderKey || 'id';
    this._WRONG_TYPE_MESSAGE = wrongTypeMessage || "Wrong file's MIME type";
  }

  /**
   * Sequelize beforeUpdate hook
   * @param {Sequelize.Instance} instance
   * @param {Object} options - Sequelize save options
   * @return {Promise}
   */

  /**
   * Sequelize afterCreate hook
   * @param {Sequelize.Instance} instance
   * @param {Object} options - Sequelize save options
   * @return {Promise}
   */

  _createClass(SequelizeField, [{
    key: "_setFile",

    /**
     * Abstract Hook
     * @param {Sequelize.Instance} instance
     * @param {Object} options - Sequelize save options
     * @param {Boolean} afterCreate - if true an extra update will be triggered
     * @return {Promise}
     */

    value: function _setFile(instance, options, afterCreate) {
      var _this2 = this;

      var file = instance.getDataValue(this._VIRTUAL_ATTRIBUTE_NAME);

      if (file && file.updated || typeof file === 'undefined') return;

      if (typeOf(file) === 'Object' && typeof file.mimetype === 'string' && typeof file.path === 'string') {

        return this._moveFromTemporary(file, instance).then(function (file) {
          return _this2._attachFile(instance, file, afterCreate, options);
        }).catch(function (err) {
          return _this2._Error(err);
        });
      } else if (typeof file === 'string') {

        var url = file;
        var foldername = instance.getDataValue(this._FOLDER_KEY);
        var filename = this._BASEPATH + "/" + foldername + ("/" + nameFromUrl(url));

        return download(url, filename).catch(function (error) {
          return _this2._Error(_this2._validationError(error));
        }).then(function (file) {
          return _this2._attachFile(instance, file, afterCreate, options);
        }).catch(function (err) {
          return _this2._Error(err);
        });
      } else if (typeOf(file) === 'Null') {
        if (this._CLEANUP_IS_ON) {
          this._destroyFileHook(instance, options);
        }
        instance.setDataValue(this._PATH_ATTRIBUTE_NAME, null);
      }
    }

    /**
     * Returns Promise.reject() with a SequelizeValidationError
     * @param {Error|String} errors
     * @return {Function}
     */

  }, {
    key: "_validationError",
    value: function _validationError(err) {
      var message = undefined;
      switch (typeof err === "undefined" ? "undefined" : _typeof(err)) {
        case 'string':
          message = err;
          break;
        case 'object':
          message = err.message;
          break;
      };

      var validationError = new _sequelize.ValidationErrorItem(message, null, this._VIRTUAL_ATTRIBUTE_NAME);

      return new _sequelize.ValidationError(message, [validationError]);
    }
  }, {
    key: "_Error",
    value: function _Error(error) {
      return Promise.reject(error);
    }

    /** Sequelize hook with files deleting logic
     * @param {Sequelize.Instance} instance
     * @param {Object} options
     */

  }, {
    key: "_virtualAttributeGetter",

    /** Returns get method for virtual attribute,
      * @return {Function} getter
      */

    value: function _virtualAttributeGetter() {
      var _SIZES = this._SIZES;
      var _PATH_ATTRIBUTE_NAME = this._PATH_ATTRIBUTE_NAME;
      var _forEachSize = this._forEachSize;

      if (_SIZES) {
        return function () {
          var path = this.getDataValue(_PATH_ATTRIBUTE_NAME);
          if (!path) return undefined;
          var output = {
            original: path
          };
          path && _forEachSize(_SIZES, function (size, name, options) {
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

  }, {
    key: "_getAttrs",
    value: function _getAttrs() {
      var _obj;

      var obj = (_obj = {}, _defineProperty(_obj, this._VIRTUAL_ATTRIBUTE_NAME, {
        type: _sequelize.VIRTUAL,
        get: this._virtualAttributeGetter()
      }), _defineProperty(_obj, this._PATH_ATTRIBUTE_NAME, {
        type: (0, _sequelize.STRING)(1234),
        allowNull: true
      }), _obj);
      if (this._CROP_IS_ON) {
        obj[this._CROP_ATTRIBUTE_NAME] = {
          type: _sequelize.VIRTUAL
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

  }, {
    key: "_moveFromTemporary",
    value: function _moveFromTemporary(file, instance) {
      var _this3 = this;

      var path = file.path;

      return new Promise(function (resolve, reject) {

        var instancePath = "" + _this3._BASEPATH.replace(/\/$/, '') + ("/" + instance.getDataValue(_this3._FOLDER_KEY));
        var newPath = instancePath + ("/" + nameFromUrl(path));

        return createDir(instancePath).then(function (instancePath) {
          (0, _mv2.default)(path, newPath, function (err) {
            if (err) return reject(err);

            resolve(_extends({}, file, {
              path: newPath
            }));
          });
        }).catch(function (err) {
          reject(err);
        });
      });
    }

    /** Recizes image and crops it if constructor's options.crop is true;
     * @param {Sequelize.Instance} instance
     * @param {Object} file
     * @param {String} file.path
     * @return {Promise}
     */

  }, {
    key: "_processImage",
    value: function _processImage(instance, file) {
      var _this4 = this;

      return getSize(file.path).then(function (_ref2) {
        var width = _ref2.width;
        var height = _ref2.height;

        var gmi = gm(file.path);
        if (_this4._CROP_IS_ON) {
          var crop = instance.getDataValue(_this4._CROP_ATTRIBUTE_NAME);
          if (crop) {

            /** Crop's props are implied to be in percents
             * - we need absolutes
             */
            crop = {
              width: width * (Number(crop.width) || 1),
              height: height * (Number(crop.height) || 1),
              x: width * Number(crop.x),
              y: height * Number(crop.y)
            };

            gmi = gmi.crop(crop.width, crop.height, crop.x, crop.y);
          }
        }
        return _this4._resizeAll(gmi, file.path);
      });
    }
  }, {
    key: "_attachFile",

    /** Sets file path to instance's path attribute
     * @param {Object} instance - sequelize instance
     * @param {Object} file
     * @param {String} file.path
     * @param {String} file.mimetype
     * @param {Boolean} afterCreate
     * @param {Object} options - sequelize hook options
     * @return {Promise<, Error> | undefined}
     */

    value: function _attachFile(instance, file, afterCreate, options) {
      var _this5 = this;

      if (!new RegExp(this._MIMETYPE).test(file.mimetype)) {

        /* Remove bad temporary */
        _fs2.default.stat(file.path, function (err, stat) {
          if (!err) {
            _fs2.default.unlink(file.path);
          }
        });

        throw this._validationError(this._WRONG_TYPE_MESSAGE || "Wrong file MIME type: " + ("should be " + mimetype + ", but got " + file.type));
      }

      if (this._CLEANUP_IS_ON) {
        this._destroyFileHook(instance, options);
      }

      var isImage = /image/.test(file.mimetype);

      var promise = new Promise(function (resolve) {
        instance.setDataValue(_this5._PATH_ATTRIBUTE_NAME, _this5._publicPath(file.path));
        resolve(instance);
      });

      if (afterCreate) {
        promise = instance.update(_defineProperty({}, this._PATH_ATTRIBUTE_NAME, this._publicPath(file.path)), options);
      }

      instance.setDataValue(this._VIRTUAL_ATTRIBUTE_NAME, { updated: true });

      return promise.then(function (instance) {
        if (_this5._SIZES && isImage) {
          return _this5._processImage(instance, file);
        }
      });
    }
  }, {
    key: "_resizeAll",

    /** Iterates through sizes and resizes with Promise.all
     * @param {Object} gm - gm instance, ex. gm('img.jpg')
     * @param {Object} instance - sequelize instance
     * @param {String} path
     * @return {Promise<object, Error>} promise which resolves with size object
     */

    value: function _resizeAll(gm, path) {
      var promises = [];
      this._forEachSize(this._SIZES, function (size, name, options) {
        promises.push(resize(gm, path, name, size, options.quality));
      });
      return Promise.all(promises);
    }
  }, {
    key: "_forEachSize",

    /**
     * Iterates over sizes object
     * @param {Object} sizes
     * @param {function(size: String, name: String, options: Object)} cb
     */

    value: function _forEachSize(sizes, cb) {
      for (var key in sizes) {
        var options = sizes[key];
        var size = (typeof options === "undefined" ? "undefined" : _typeof(options)) === 'object' ? size.size : options;
        if (typeof options === 'string') options = {};
        // size = Number(size);
        cb(size, key, options);
      };
    }
  }, {
    key: "_publicPath",

    /** Get path relative to public folder
     * @param {String} path - path in package folder, ex. public/uplods
     * @return {String} publicPath - path in public folder, ex. /uploads
     */

    value: function _publicPath(path) {
      return path.replace(new RegExp('^' + (0, _escapeStringRegexp2.default)(this._PUBLIC_PATH)), '');
    }

    /** Get path relative to package folder
     * @param {String} path - path in public folder with leading root,
     *                        ex. /uploads
     * @return {String} publicPath - path in package folder, ex. public/uplods
     */

  }, {
    key: "_fromPublic",
    value: function _fromPublic(path) {
      return "" + this._PUBLIC_PATH + path;
    }

    /** Sets neccesary attributes on Model
     * @param {Sequelize.Model} Model
     */

  }, {
    key: "_addAttrsTo",
    value: function _addAttrsTo(Model) {
      _sequelize.Utils.mergeDefaults(Model.rawAttributes, this._getAttrs());
      Model.refreshAttributes();
    }

    /** Sets neccesary hooks on Model
     * @param {Sequelize.Model} Model
     */

    /* --- PUBLIC API ------------------------------------------------------- */

    /** Sets neccesary attributes and hooks on Model
     * @param {Sequelize.Model} Model
     */

  }]);

  return SequelizeField;
})();

/**
 * gm Promise wrappers
 */

/** Promise wrapper for gm.size
 * @param {String} path
 * @return {Promise<object, Error>} promise which resolves with size object
 */

exports.default = SequelizeField;
function getSize(path) {
  return new Promise(function (resolve, reject) {
    gm(path).size(function (err, size) {
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

function resize(gm, path, name, size) {
  var quality = arguments.length <= 4 || arguments[4] === undefined ? DEFAULT_QUALITY : arguments[4];

  return new Promise(function (resolve, reject) {
    var filename = name ? pathWithSize(path, name) : path;

    var _parseSize = parseSize(size);

    var width = _parseSize.width;
    var height = _parseSize.height;
    var options = _parseSize.options;

    gm.resize(width, height, options).quality(quality).write(filename, function (err) {
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
  var result = String(str).match(/(\d+)?x?(\d+)?(.+)?/);
  return {
    width: result[1],
    height: result[2],
    options: result[3]
  };
}

/**
 * Utility functions
 */

function typeOf(entity) {
  return Object.prototype.toString.call(entity).match(/(\w+)\]/)[1];
}

function getType(entity) {
  var type = typeOf(entity);
  return type === 'Object' ? "[object Object] { " + Object.keys(entity).map(function (key) {
    return key + ": " + typeOf(entity[key]);
  }).join(',\n') + " }" : type;
}

function validateType(obj, type) {
  var name = Object.keys(obj)[0];
  var entity = obj[name];
  var valid = (0, _typeCheck.typeCheck)(type, entity);
  if (!valid) {
    throw new TypeError("Expected " + name + " to be of type " + type + "," + (" but got " + getType(entity)));
  }
  return valid;
}

function download(url, path) {
  return new Promise(function (resolve, reject) {
    _request2.default.head(url, function (err, res, body) {
      if (err) return reject(err);

      if (res.statusCode < 200 || res.statusCode >= 400) {
        reject("Can't download resource: \"" + url + "\" responded with " + ("\"" + res.statusCode + ": " + res.statusMessage + "\""));
      }

      var mimetype = res.headers['content-type'];
      var basepath = path.match(/(.+)(\/.+)$/)[1];

      (0, _mkdirp2.default)(basepath, function (err) {
        if (err) return reject(err);
        (0, _request2.default)(url).pipe(_fs2.default.createWriteStream(path)).on('close', function () {
          return resolve({ mimetype: mimetype, path: path });
        });
      });
    });
  });
}

function nameFromUrl(url) {
  return url.match(/\/([^\/]+)$/)[1];
}

function pathWithSize(path, size) {
  if (typeof path !== 'string') {
    throw new TypeError("Path must be a string, but got " + (typeof path === "undefined" ? "undefined" : _typeof(path)));
  }
  return "" + path.replace(/(.+)(\..+)$/, '$1_' + size + '$2');
}

function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.substr(1);
}

function createDir(path) {
  return new Promise(function (resolve, reject) {
    _fs2.default.stat(path, function (err, stat) {
      if (err && err.code === 'ENOENT') {
        (0, _mkdirp2.default)(path, function (err) {
          if (err) return reject(err);
          return resolve(path);
        });
      } else {
        resolve(path);
      }
    });
  });
}