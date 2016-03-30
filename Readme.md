# Sequelize File

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
Then, you extract necessary attributes and hooks and attach them to your model. Using ES7's object rest spread, it will look like this:

```javascript
/* models/User.js */
import sequelize from './db';
import { STRING } from 'sequelize';
import { picture, backgroundImage } from './attachments';

let User = sequelize.define('user', {
  name: STRING,
  /* And all of your plain sequelize attributes... */
  ...picture.attrs,
  ...backgroundImage.attrs
});

picture.addHooksTo(User);
backgroundImage.addHooksTo(User);

export default User;
```
Of course, you can share same attachments across multiple models.

After this, you'll be able to set files just as ordinary sequelize attributes. You can attach files either as urls (they will be downloaded), or as pre-downloaded [multer](https://github.com/expressjs/multer)-style objects (basically, only `path` and `mimetype` props are required)

```javascript

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

user2.save()
// Deleting file(s)
.then(user2 => {
  user2.update({ picture: null })
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

This package is under early development. Use with caution!
