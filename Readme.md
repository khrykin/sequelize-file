# Sequelize File
[![Travis](https://img.shields.io/travis/khrykin/sequelize-file.svg)](https://travis-ci.org/khrykin/sequelize-file)
[![npm](https://img.shields.io/npm/v/sequelize-file.svg)](https://www.npmjs.com/package/sequelize-file)

This package allows you to attach files to your sequelize instances as easy as you set your plain attributes, and define MIME type validation and post-processing rules next to your models.

## Requirements
By now you will need [ImageMagick](http://www.imagemagick.org/script/index.php) installed on your system. On OSX it's just one `brew install imagemagick` away.


## Usage
First, you define which fileds you want to enhance with attachments logic:

```javascript
/* models/attachments.js */

import SequelizeFile from 'sequelize-file';

export const picture = SequelizeFile({
   attribute: 'picture',
   mimetype: /^image/,
   crop: true,
   sizes: {
     small: 64, //width 64
     big: 150, //width 150
   }
});

export const backgroundImage = SequelizeFile({
  attribute: 'backgroundImage',
  mimetype: /^image/,
  crop: true,
  sizes: {
    preview: "x350" // height 350
  }
});

```
Then, you attach enhanced attributes to your model:

```javascript
/* models/User.js */

import sequelize from './db';
import { STRING } from 'sequelize';
import { picture, backgroundImage } from './attachments';

let User = sequelize.define('user', {
  name: STRING,
  /* And all of your plain sequelize attributes... */
});

picture.addTo(User);
backgroundImage.addTo(User);

export default User;

```
Of course, you can share same attachments rules across multiple models.

After this, you'll be able to set files just as ordinary sequelize attributes. You can attach files either as urls (they will be downloaded), or as pre-downloaded [multer](https://github.com/expressjs/multer)-style objects (basically, only `path` and `mimetype` props are required)

```javascript

sequelize.sync({ force: true }).then(() => {

  // If you set url, file will be downloaded and saved
  let user1 = User.build({
    picture: "http://example.com/somepic.jpg"
  });
  user1.save();

  // Or you can pass multer-style File object, for example
  let user2 = User.build({
    picture: "http://example.com/somepic2.jpg",
    backgroundImage: {
      path: '/uploads/tmp/somepic.jpg',
      mimetype: 'image/jpeg'
    }
  });

  user2.save();

  // Deleting file(s)
  .then(user2 => {
    user2.update({ picture: null });
  });

});

```
You access all of your resized images through dot notation. If you didn't setup resizing, you'll get original file.

```javascript

User.findById(1)
.then(user => {
  console.log(user.picture.small);
  console.log(user.picture.big);
  console.log(user.picture.original);
});

```

## Status

This package is under early development. Do use it with caution!
