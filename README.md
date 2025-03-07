# causeconnect

# group presentation video : 
https://youtu.be/N_uylBUn1lw

# create a .env file in the root directory if it's not there already and enter the following:
# by deafult the .env file is hidden

GMAIL_USER='causeconnect.wdc@gmail.com'
GMAIL_PASS='gfgi agnj dfkk jhxl'
GOOGLE_CLIENT_ID=496597084561-173o6aoldcel0m70qa3b9bjpdl6h6ttf.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
DB_HOST=localhost
DB_USER=root
DB_PASS=causeconnect
DB_NAME=causeconnect

# start mysql server
sudo service mysql start

# load the database
mysql < ./sql/causeconnect.sql

# load the madeup data
mysql < ./sql/load_data.sql

# start mysql
mysql

# use causeconnect database
use causeconnect;

# install node_modules (in a separate terminal)
npm install

# install dependencies
npm install bcrypt body-parser connect-flash dotenv ejs express express-session express-validator mysql2 nodemailer passport passport-google-oauth20 passport-local nodemon fs child_process

# run the server
npm start
