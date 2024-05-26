require('dotenv').config()
const express = require('express')
const ejs = require('ejs')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const axios = require('axios');
const session = require('express-session')
const passportLocalMongoose = require('passport-local-mongoose')
const passport = require('passport')
const flash = require('connect-flash');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const paypal = require('paypal-rest-sdk')
const escapeHtml = require('escape-html')
const Coinpayments = require('coinpayments');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const multer = require('multer'); 



const PORT = process.env.PORT || 3000

paypal.configure({
  mode: 'live', 
  client_id:process.env.PAYPAL_CLIENT_ID ,
  client_secret: process.env.PAYPAL_SECRET,
})

/*
paypal.configure({
  mode: 'sandbox', 
  client_id:"AWN3LeQIwWvpNTSN9MJSA3EpLedt7ua3Jy-u7s-38M0T-na3su0JtuCXOsi0IS4xRoAh2pwPFMpCln3y" ,
  client_secret: "ENPeIsWVGnT_7RaAYAnlOXLzNVFfpUP8Dx0Xfbk2VMpHyLWpLWYF2eVDFXkCe48-9UXm5juP_nFxo7MN",
})*/


const client = new Coinpayments({
  key: process.env.COINPAYMENT_KEY,
  secret: process.env.COINPAYMENT_SECRET,  
});

// Set up multer for handling file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads'); // Specify the directory to save the uploaded files
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ dest: 'uploads/' });

//stripe api credentials
const PUBLISHABLE_KEY = process.env.STRIPE_PUBLISH_KEY
const SECRET_KEY = process.env.STRIPE_SECRET_KEY
//const PUBLISHABLE_KEY = "pk_test_51Nv1LICzBZHxsYa2cLrtr1GvgwdeUBHbZU8zRyOyx0li7nnCod7zLOGxWnfKznCfSqsZRZ8kPyOycZMOafhzsdjV00I1GM2POK"
//const SECRET_KEY = "sk_test_51Nv1LICzBZHxsYa2sTmO3PAdIV3I1CZGezIwpS3BM3aXGZoeZKdPmgHLksQvXpKeZ0VBMC6Af4lMK4qHI8zkm1TO00pavdmEyM"
const stripe  = require('stripe')(SECRET_KEY)


const app = express()

//mongoose.connect('mongodb://localhost:27017/MineHubDB')
mongoose.connect(process.env.DATBASE_URL)

app.use(express.static('public'))
app.set('view engine','ejs')
app.use(bodyParser.urlencoded({ extended: true}))
app.use(bodyParser.json())

app.use(session({
    secret:process.env.SECRET,
    resave:false,
    saveUninitialized:false
}))

app.use(passport.initialize())
app.use(passport.session())
app.use(flash());

const userSchema = new mongoose.Schema ({
    name:String,
    username: String,
    password: String,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    balance:{
      type:Number,
      default:0.00000000
    },
    notification:{
      type:Boolean,
      default: true
    },
    wishlistedAddress:{
      type:String,

    },
    referralCode: String,
    hashRates: [
      {
        coin: String,
        hashRate: {
          type: Number,
          default: 0
        },
        timestamp: { type: Date, default: Date.now }
      }
    ],
    despositedAmount:{
      type:Number,
      default:0
    },
    despositedBtc:{
      type:Number,
      default:0
    },
    paid:{
      type:Boolean,
      default:false
    },
    
    twoFactorAuthEnabled: {
        type: Boolean,
        default: false // Set to true when user enables 2FA
      },
      twoFactorAuthSecret: {
        type: String // Store the user's 2FA secret key
        // You might want to store this encrypted for security purposes
      },
      twoFactorAuthCompleted: {
        type: Boolean,
        default: false // Set to true when user successfully completes 2FA
      },

})
const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});
// Referral schema
const referralSchema = new mongoose.Schema({
  referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  referred: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});


userSchema.plugin(passportLocalMongoose)



const User = new mongoose.model('User',userSchema)
const Transaction = mongoose.model('Transaction', transactionSchema);
const Referral = mongoose.model('Referral', referralSchema);


passport.use(User.createStrategy())
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id, (err, user) => {
        done(err, user);
    });
});

//verify if user is Authenticated
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    
    res.redirect('/login');
}
// Generate a unique referral code for a new user
function generateReferralCode(){
  return uuidv4().substr(0, 8); // Unique identifier using uuid, shortened for brevity
};


const transporter = nodemailer.createTransport({
  service: 'Gmail', // Use the appropriate email service
  auth: {
    user:'hello.minehub@gmail.com', // Your email address
    pass: 'jcfq coac mthx pphv' // Your email password or app-specific password
  }
});

//Get Routes
app.get('/',async(req,res)=>{
    try {
        const cryptoData = await getCryptoPrices();
        
        res.render('home', { cryptoData });
      } catch (error) {
        res.status(500).send('Error fetching data');
      }
})
// Function to fetch cryptocurrency pricesasync function getCryptoPrices() {
  async function getCryptoPrices() {
    try {
      const response = await axios.get('https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD');
      return response.data;
    } catch (error) {
      console.error('Error occurred while fetching data:', error);
      throw error;
    }
  }
  


  app.get('/login',(req,res)=>{
    const errorMessage = req.flash('error')[0];
    const message = "please verify"
    res.render('login',{errorMessage,message})
  })

  app.get('/register',(req,res)=>{
    res.render('register')
  })
  app.get('/forgot-password', (req, res) => {
    res.render('forgot-password'); 
  });
  app.get('/reset/:token', (req, res) => {
    const token = req.params.token;
  
    // Find user by the reset token and check if it's still valid
    User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    }, (err, user) => {
      if (err || !user) {
        return res.render('error', { message: 'Invalid or expired token' });
      }
  
      // Render a form to reset the password
      res.render('reset', { token });
    });
  });
app.get('/calculator',(req,res)=>{
  res.render('calculator')
})

const calculateReturnsEveryTenMinutes = (depositedBtc) => {
  const returnPercentage = 0.0000007; // 0.0173% as a decimal
  const tenMinReturn = 0.0000000 + returnPercentage;
  return tenMinReturn;
};

const updateBalanceWithMinedBTC = async (userId, minedBTC) => {
  try {
    const user = await User.findById(userId);
    user.balance += minedBTC;
    await user.save();
  } catch (error) {
    console.error('Error updating balance:', error);
  }
};

const mineAndCalculateReturns = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.despositedBtc || user.despositedBtc <= 0) {
      console.log('User has no deposited BTC or invalid deposit amount');
      return;
    }

    const tenMinReturn = calculateReturnsEveryTenMinutes(user.despositedBtc);
    await updateBalanceWithMinedBTC(userId, tenMinReturn);

    console.log('Ten minutes return calculated and added to the user balance:', tenMinReturn);
  } catch (error) {
    console.error('Error occurred during mining and return calculation:', error);
  }
};

const startMiningInterval = (userId) => {
  // Set interval to run the mineAndCalculateReturns function every 10 minutes (600,000 milliseconds)
  setInterval(async () => {
    await mineAndCalculateReturns(userId);
  }, 600000); // Adjust the time interval as needed (10 minutes = 600,000 milliseconds)
};

app.get('/dash', async (req, res, next) => {
  // ... Existing authentication and data fetching logic

  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }

  if (req.user && req.user.twoFactorAuthEnabled && !req.user.twoFactorAuthCompleted) {
    return res.render('twoFactorVerification', { message: "please verify" });
  }

  try {
    const cryptoData = await getCryptoPrices(); // Assuming this function fetches crypto prices

    // Fetch recent transactions from the database
    const recentTransactions = await Transaction.find({ userId: req.user._id })
      .sort({ timestamp: -1 })
      .limit(5);

    // Fetch updated user data
    const updatedUser = await User.findById(req.user._id);
    const updatedBalance = updatedUser.balance;

    // Render the dash view with initial data
    res.render('dash', { cryptoData, user: req.user, recentTransactions, updatedBalance });

    // Start mining interval after 10 minutes
    setTimeout(() => {
      startMiningInterval(req.user._id);
    }, 600000); // Set to start mining after 10 minutes (600,000 milliseconds)
  } catch (error) {
    console.error('Error occurred while fetching data:', error);
    res.status(500).send('Error fetching data');
  }
});


app.get('/transactions',ensureAuthenticated,async(req,res)=>{
  const user = req.user
  // Fetch recent transactions from the database, assuming Transaction is your model
  const recentTransactions = await Transaction.find({ userId: req.user._id })
  .sort({ timestamp: -1 }) // Sort by timestamp in descending order to get recent transactions
  .limit(5); // Limit the number of transactions to display


  res.render('transaction-history',{user,recentTransactions})
})
app.get('/withdraw',ensureAuthenticated,(req,res)=>{
  const user = req.user
  res.render('withdraw',{user})
})
app.get('/buy-contracts',ensureAuthenticated,(req,res)=>{

  const user = req.user
    
  res.render('buy-contracts',{user})

})
app.get('/settings',ensureAuthenticated,((req,res)=>{
  const user = req.user
  let successMessage ;
  
  if (req.query.success === 'true') {
     successMessage = 'Settings updated successfully';
 }
  res.render('settings',{user,successMessage})
}))
app.get('/support',ensureAuthenticated,(req,res)=>{
  const user = req.user
  res.render('support',{user})
})
app.get('/logout',ensureAuthenticated, (req,res)=>{
  req.logout((err)=>{
    if(err){
        console.log(err)
        res.redirect('/dash')
    }else{
        res.redirect('/')
    }
})
})
app.get('/2fa-verification/:checked', ensureAuthenticated, async (req, res) => {
  const isChecked = req.params.checked === 'true';
  const user = req.user;

  try {
      console.log(isChecked);
      // If 2FA is being enabled
      if (isChecked) {
          const verificationCode = generateVerificationCode(); // Function to generate a verification code
          console.log(verificationCode);
          const userEmail = req.user.username; // Get user's email from the authenticated session

          transporter.sendMail({
              to: userEmail,
              subject: 'Two Factor Verification Code',
              html: `Your 2FA Code is ${verificationCode}.`,
          }, async (err) => {
              if (err) {
                  return res.render('error', { message: 'Error sending reset email' });
              }

              try {
                  await User.findByIdAndUpdate(user._id, {  twoFactorAuthSecret: verificationCode });
                  res.render('2factor', { user, message: 'Verification code sent to email' });
              } catch (err) {
                  console.error(err);
                  res.render('error', { message: 'Error updating user record' });
              }
          });
      }
  } catch (err) {
      console.error(err);
      res.render('error', { message: 'General error' });
  }
});

// Function to generate a random verification code
function generateVerificationCode() {
  const length = 6; // Define the length of the verification code
  const characters = '0123456789'; // Define the characters allowed in the code
  let code = '';

  // Generate a random code using specified characters
  for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      code += characters.charAt(randomIndex);
  }

  return code; // Return the generated verification code
}

app.get('/payment_error', ensureAuthenticated,(req, res) => {
  const paymentStatus = req.query.status; // Get the payment status query parameter
  console.log("payment ",paymentStatus)
  // Render the 'cancelled' view with the payment status
  res.render('cancelled');
});
app.get('/payment_success', ensureAuthenticated, async (req, res) => {
  const payerId = req.query.PayerID;
  const paymentId = req.query.paymentId;
  const userId = req.user._id;
  const user = req.user

  // Check if payerId, paymentId, and userId are valid
  if (!payerId || !paymentId || !userId) {
      console.error("Invalid parameters.");
      return res.redirect('/payment_cancel');
  }

  const execute_payment_json = {
      "payer_id": payerId,
      "transactions": [{
          "amount": totalAmount
      }]
  };

  console.log("payerId:", payerId);
  console.log("amount:", totalAmount);

  paypal.payment.execute(paymentId, execute_payment_json, async (err, payment) => {
      if (err) {
          console.error(err.response);
          return res.redirect('/payment_error');

      } else {

          console.log("Payment successful");
          console.log(JSON.stringify(payment));

          try {
              // Retrieve the user by their ID
              const user = await User.findById(userId);

              if (!user) {
                  console.error("User not found.");
                  return res.redirect('/payment_error');
              }

            
             // Function to update hash rate for a specific coin
              function updateHashRateForCoin(user, coin, hashrateAmount) {
                const existingCoinIndex = user.hashRates.findIndex(rate => rate.coin === coin);

                if (existingCoinIndex !== -1) {
                  // If the coin exists, update its hash rate by adding the new amount
                  user.hashRates[existingCoinIndex].hashRate += hashrateAmount;
                  user.hashRates[existingCoinIndex].timestamp = new Date();
                } else {
                  // If the coin doesn't exist, create a new entry
                  user.hashRates.push({
                    coin,
                    hashRate: hashrateAmount,
                    timestamp: new Date()
                  });
                }
              }
              updateHashRateForCoin(user, 'BTC', hashrateAmount);
              user.despositedAmount += amount;

              console.log('despositedAmount',user.despositedAmount)

              const axios = require('axios');

              async function convertUSDtoBTC(amountInUSD) {
                try {
                    const apiUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
                    const response = await axios.get(apiUrl);
                    
                    const btcToUsd = response.data.bitcoin.usd;
                    const amountInBTC = amountInUSD / btcToUsd;
                    
                    return amountInBTC.toFixed(8); // Convert and return as a string with 8 decimal places
                } catch (error) {
                    console.error('Error fetching data:', error);
                    return null;
                }
            }
            
            // Usage:
            const amountInUSD = amount; // Replace with your amount in USD
            convertUSDtoBTC(amountInUSD)
                .then(async amountInBTCString => {
                    if (amountInBTCString !== null) {
                        console.log(`${amountInUSD} USD is approximately equal to ${amountInBTCString} BTC`);
            
                        const userId = req.user._id; // Assuming you have the user ID from the request
                        // Retrieve the user by their ID
                        try {
                            const user = await User.findById(userId);
            
                            if (user) {
                                // Update the user's depositedAmount field with the converted BTC amount
                                user.despositedBtc += amountInBTCString;
                                await user.save();
                                console.log('Amount saved to user:', user.despositedBtc);
                            } else {
                                console.log('User not found');
                            }
                        } catch (error) {
                            console.error('Error updating user:', error);
                        }
                    } else {
                        console.log('Failed to convert amount');
                    }
                });


            // Save the updated user
            user.save((err) => {
              if (err) {
                console.log(err);
              } else {
                console.log("Hash rate updated ", user.hashRates);
              }
            });
              // Send a confirmation email to the user
             
            
              const message = `New Deposit from ${escapeHtml(user.username)},\nAmount: $${amount},\nHashRate: ${hashrateAmount}TH\nStatus:Approved\nPayment Method: Paypal`;
  

              const BOT_TOKEN = '6789981476:AAHGPQLaUuvrXr4XCBod9KUmdB87s0eNM20';
              const CHAT_ID = '-1002042570410'; // This can be your group chat ID

              async function sendMessageToGroup(message,amount) {
                try {
                  const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    chat_id: CHAT_ID,
                    text: message,
                  });

                  console.log('Message sent:', response.data);
                } catch (error) {
                  console.error('Error sending message:', error);
                }
              }

              // Usage example
              sendMessageToGroup(message);
              const newTransaction = new Transaction({
                userId: req.user._id, // Assuming req.user._id contains the user's ID
                amount: hashrateAmount, // Assuming amountInCents contains the transaction amount
                description: 'Buying hashrate' // Set your transaction description here
              });
              
              // Save the transaction
              newTransaction.save((err, savedTransaction) => {
                if (err) {
                  console.error(err);
                  // Handle error while saving transaction
                } else {
                  console.log('Transaction saved:', savedTransaction);
                  // Transaction successfully saved to the database
                  // You might also want to update the user's data to reflect this transaction
                }
              });

              transporter.sendMail({
                to: user.username,
                subject: 'Deposit Confirmation',
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #007bff;">Deposit Confirmation</h2>
                    <p>Hello ${user.username},</p>
                    <p>Your deposit for ${hashrateAmount}TH has been processed.</p>
                    <p>If you have any questions or concerns, please contact our support team.</p>
                    <p>Paid Amount: ${amount}</p>
                    <p style="font-weight: bold;">Thank you Minehub.</p>
                  </div>
                `,
              });

              // Render the success page with the updated balance
              res.render("success",{payerId,paymentId,user ,amount, hashrateAmount});
          } catch (error) {
              console.error('Error occurred while processing user or sending email:', error);
              res.redirect('/payment_error');
          }
      }
  });
});

app.get('/referral/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const referralLink = `https://yourdomain.com/register/${user.referralCode}`;
    res.render('referral', { referralLink }); // Render 'register.ejs' and pass referralLink
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/forgot-password', (req, res) => {
  crypto.randomBytes(20, (err, buf) => {
    if (err) throw err;

    const token = buf.toString('hex');
    const username = req.body.email; // Assuming this is obtained from the request body

    User.findOne({ username }, (err, user) => {
      if (err || !user) {
        return res.render('error', { message: 'User not found' });
      }

      user.resetPasswordToken = token;
      user.resetPasswordExpires = Date.now() + 3600000;

      user.save((err) => {
        if (err) throw err;

   
      const resetLink = `https://minehub.onrender.com/reset/${token}`;

        transporter.sendMail({
          to: username,
          subject: 'Password Reset',
          html: `You can reset your password <a href="${resetLink}">here</a>.`,
        }, (err) => {
          if (err) {
            return res.render('error', { message: 'Error sending reset email' });
          }
          res.render('success-reset', { message: 'Email sent' });
        });
      });
    });
  });
});



app.post('/reset/:token', async (req, res) => {
  const token = req.params.token;
  const newPassword = req.body.password; // Assuming password is sent in request body

  try {
    // Find user by the reset token and check if it's still valid
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.render('error', { message: 'Invalid or expired token' });
    }

    console.log('new password ',newPassword)
    // Use setPassword to update the user's password
    user.setPassword(newPassword, async () => {
      try {
        await user.save();

        // Reset token and expiration after password change
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        // Password updated successfully, render a success view
        return res.render('password-reset-success');
      } catch (error) {
        console.error('Error resetting password:', error);
        return res.render('error', { message: 'Error resetting password' });
      }
    });
  } catch (error) {
    console.error('Error finding user:', error);
    return res.render('error', { message: 'Error finding user' });
  }
});


let hashrateAmount;
let amount;
let totalAmount= {}
//Post Route
app.post('/paypalRoute',ensureAuthenticated,(req,res)=>{
  amount = req.body.amount
  hashrateAmount = req.body.hashrateAmount

  amount = parseFloat(amount)
  hashrateAmount = parseInt(hashrateAmount);

  amount = amount + 3
  console.log("hash", hashrateAmount,typeof hashrateAmount)
  console.log('amount',amount, typeof amount)

    // Check if the amount is a valid number
    if (isNaN(amount) || amount <= 0) {
        return res.status(400).send('Invalid amount');
    }
    // Ensure it's a valid number
    if (isNaN(hashrateAmount) || hashrateAmount <= 0) {
      return res.status(400).send('Invalid hashrate amount');
  }

    // Construct the amount object
     totalAmount = {
        currency: 'USD',
        total: amount.toFixed(2) // Format total as a string with two decimal places
    };

    // Construct the payment request
    const paymentRequest = {
        intent: 'sale',
        payer: {
            payment_method: 'paypal'
        },
        redirect_urls: {
            return_url: 'http://localhost:3000/payment_success',
            cancel_url: 'http://localhost:3000/payment_error'
        },
        transactions: [{
            item_list: {
                items: [{
                    name: 'Hashrates',
                    sku: 'Hashrate',
                    price: totalAmount.total,
                    currency: totalAmount.currency,
                    quantity: 1,
                }]
            },
            amount: totalAmount,
            description: 'Buying Hasrates'
        }]
    };

    // Create the payment
    paypal.payment.create(paymentRequest, (error, payment) => {
      console.log('Payment Request:', JSON.stringify(paymentRequest, null, 2));


        if (error) {
            console.error('Error occurred while creating payment:', error);
            return res.status(500).send('Internal Server Error');
        }

        // Redirect to PayPal approval URL
        const approvalUrl = payment.links.find(link => link.rel === 'approval_url');

        if (!approvalUrl) {
            console.error('Approval URL not found in the PayPal response.');
            return res.status(500).send('Internal Server Error');
        }
        console.log('Payment created sucessfully')
        res.redirect(approvalUrl.href);
    });

})

app.post('/withdrawl', ensureAuthenticated, (req, res) => {
  const withdrawAmount = parseFloat(req.body.withdrawAmount); // Parse the withdrawal amount
  const user = req.user;

  console.log(withdrawAmount, typeof withdrawAmount)

  if (user.balance < withdrawAmount) {
    // Check if the user has sufficient balance
    return res.render('insufficient-funds'); // Render a page indicating insufficient funds
  }
  if(withdrawAmount===null|| withdrawAmount===undefined){
    return res.render('please enter a valid amount')
  }
  if(user.wishlistedAddress ===""){
   return  res.send("Please the wishlisted address")
  }

  // Deduct the withdrawal amount from the user's balance
  user.balance -= withdrawAmount;

  // Perform any database update or save the user with the updated balance
  user.save() 

  const message = `New Withdraw from ${escapeHtml(user.username)},\nAmount: ${withdrawAmount}BTC\nStatus:Successfully sent to blockchain`;
  

  const BOT_TOKEN = '6789981476:AAHGPQLaUuvrXr4XCBod9KUmdB87s0eNM20';
  const CHAT_ID = '-1002042570410'; // This can be your group chat ID

  async function sendMessageToGroup(message,amount) {
    try {
      const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: message,
      });

      console.log('Message sent:', response.data);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  // Usage example
  sendMessageToGroup(message);
  const newTransaction = new Transaction({
    userId: req.user._id, // Assuming req.user._id contains the user's ID
    amount: withdrawAmount, // Assuming amountInCents contains the transaction amount
    description: 'Withdraw' // Set your transaction description here
  });
  
  // Save the transaction
  newTransaction.save((err, savedTransaction) => {
    if (err) {
      console.error(err);
      // Handle error while saving transaction
    } else {
      console.log('Transaction saved:', savedTransaction);
      // Transaction successfully saved to the database
      // You might also want to update the user's data to reflect this transaction
    }
  });

  // Send withdrawal confirmation email
transporter.sendMail({
  to: user.username,
  subject: 'Withdrawal Confirmation',
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #007bff;">Withdrawal Confirmation</h2>
      <p>Hello ${user.username},</p>
      <p>Your withdrawal request for ${withdrawAmount} BTC has been processed.</p>
      <p>If you have any questions or concerns, please contact our support team.</p>
      <p>Sent to: ${user.wishlistedAddress}</p>
      <p style="font-weight: bold;">Thank you Minehub.</p>
    </div>
  `,
});


  // Render a success message or redirect to a success page
  return res.render('success-withdrawal', { amount: withdrawAmount,user });
});

// Assuming you have authentication middleware (ensureAuthenticated) to get the user
app.post('/usdt', ensureAuthenticated, async (req, res) => {
 const amount = parseFloat(req.body.amount);
  const hashrateAmount = parseFloat(req.body.hashrateAmount);
  const user = req.user;
  const userEmail = user.username
  const currency = 'USDT';

  
  
    
    res.render('usdt', { amount });
  });
  


// POST route for submitting proof of payment


app.post('/submitProof',ensureAuthenticated, upload.single('proof'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const proofFilePath = req.file.path;
  const user = req.user; // Assuming you have user information available in req.user
  const text = req.body.text

  const mailOptions = {
    from: user.username,
    to: 'hello.minehub@gmail.com',
    subject: 'Proof of Payment',
    text: 'Proof of payment attached from user ' + user.username + ' saying ' + text,
    attachments: [
      {
        filename: req.file.originalname,
        path: proofFilePath
      }
    ]
  };

  // Sending email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
      res.status(500).send('Error occurred while sending email.');
    } else {
      console.log('Email sent: ' + info.response);
      res.redirect('/manual-payment');
    }
  });
});
app.get('/manual-payment',ensureAuthenticated,(req,res)=>{
  const user = req.user
  res.render('manual-payment')
})


app.post('/payment/callback', async (req, res) => {
  const payload = req.body; // This will contain transaction details from CoinPayments
  const user = req.user

  // Extract relevant information from the payload
  const { amount, txn_id, status, address, buyer_email } = payload;

  // Perform necessary actions to verify the payment
  try {
    // Find the user by their email or address or any unique identifier
    const user = await User.findOne({ username: user.username }); // Replace this with your user lookup logic

    if (!user) {
      console.log('User not found');
      return res.status(404).send('User not found');
    }

    // Check if the transaction matches the user and the correct amount
    if (user.address === address && parseFloat(user.expectedAmount) === parseFloat(amount)) {
      if (status >= 100) {
        // Payment successful, update user's payment status in the database
        user.paid = true; // Example: Set the user's paid status to true
               // Function to update hash rate for a specific coin
               function updateHashRateForCoin(user, coin, hashrateAmount) {
                const existingCoinIndex = user.hashRates.findIndex(rate => rate.coin === coin);

                if (existingCoinIndex !== -1) {
                  // If the coin exists, update its hash rate by adding the new amount
                  user.hashRates[existingCoinIndex].hashRate += hashrateAmount;
                  user.hashRates[existingCoinIndex].timestamp = new Date();
                } else {
                  // If the coin doesn't exist, create a new entry
                  user.hashRates.push({
                    coin,
                    hashRate: hashrateAmount,
                    timestamp: new Date()
                  });
                }
              }
              updateHashRateForCoin(user, 'BTC', hashrateAmount);
              user.despositedAmount += amount;

              console.log('despositedAmount',user.despositedAmount)

              const axios = require('axios');

              async function convertUSDtoBTC(amountInUSD) {
                try {
                    const apiUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
                    const response = await axios.get(apiUrl);
                    
                    const btcToUsd = response.data.bitcoin.usd;
                    const amountInBTC = amountInUSD / btcToUsd;
                    
                    return amountInBTC.toFixed(8); // Convert and return as a string with 8 decimal places
                } catch (error) {
                    console.error('Error fetching data:', error);
                    return null;
                }
            }
            
            // Usage:
            const amountInUSD = amount; // Replace with your amount in USD
            convertUSDtoBTC(amountInUSD)
                .then(async amountInBTCString => {
                    if (amountInBTCString !== null) {
                        console.log(`${amountInUSD} USD is approximately equal to ${amountInBTCString} BTC`);
            
                        const userId = req.user._id; // Assuming you have the user ID from the request
                        // Retrieve the user by their ID
                        try {
                            const user = await User.findById(userId);
            
                            if (user) {
                                // Update the user's depositedAmount field with the converted BTC amount
                                user.despositedBtc += amountInBTCString;
                                await user.save();
                                console.log('Amount saved to user:', user.despositedBtc);
                            } else {
                                console.log('User not found');
                            }
                        } catch (error) {
                            console.error('Error updating user:', error);
                        }
                    } else {
                        console.log('Failed to convert amount');
                    }
                });
                
            // Save the updated user
            user.save((err) => {
              if (err) {
                console.log(err);
              } else {
                console.log("Hash rate updated ", user.hashRates);
              }
            });
              // Send a confirmation email to the user
              const userEmail = req.user.username; // Assuming you have the user's email address
              const subject = 'New payment received from your mining website';
            
              const message = `New Deposit from ${escapeHtml(user.username)},\nAmount: $${amount},\nHashRate: ${hashrateAmount}TH\nStatus:Approved\nPayment Method: Credit/Debit Card`;

             

              const BOT_TOKEN = '6789981476:AAHGPQLaUuvrXr4XCBod9KUmdB87s0eNM20';
              const CHAT_ID = '-1002042570410'; // This can be your group chat ID

              async function sendMessageToGroup(message,amount) {
                try {
                  const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    chat_id: CHAT_ID,
                    text: message,
                  });

                  console.log('Message sent:', response.data);
                } catch (error) {
                  console.error('Error sending message:', error);
                }
              }

              // Usage example
              sendMessageToGroup(message);
      // Send confirmation email to the user

      const newTransaction = new Transaction({
        userId: req.user._id, // Assuming req.user._id contains the user's ID
        amount: hashrateAmount, // Assuming amountInCents contains the transaction amount
        description: 'Buying hashrate' // Set your transaction description here
      });
      
      // Save the transaction
      newTransaction.save((err, savedTransaction) => {
        if (err) {
          console.error(err);
          // Handle error while saving transaction
        } else {
          console.log('Transaction saved:', savedTransaction);
          // Transaction successfully saved to the database
          // You might also want to update the user's data to reflect this transaction
        }
      });

      transporter.sendMail({
        to: user.username,
        subject: 'Deposit Confirmation',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #007bff;">Deposit Confirmation</h2>
            <p>Hello ${user.username},</p>
            <p>Your deposit for ${hashrateAmount}TH has been processed.</p>
            <p>If you have any questions or concerns, please contact our support team.</p>
            <p>Paid Amount: ${amount}</p>
            <p style="font-weight: bold;">Thank you Minehub.</p>
          </div>
        `,
      });
      
        await user.save();

        console.log('Payment verified and user updated:', user);
        return res.status(200).send('Payment verified and user updated');
      } else {
        // Payment is pending or incomplete
        console.log('Payment pending or incomplete:', status);
        return res.status(200).send('Payment pending or incomplete');
      }
    } else {
      // Transaction doesn't match user or amount
      console.log('Transaction does not match user or amount');
      return res.status(400).send('Transaction does not match user or amount');
    }
  } catch (error) {
    console.error('Error processing payment callback:', error);
    return res.status(500).send('Error processing payment callback');
  }
});




app.post('/bitcoin', ensureAuthenticated, (req, res) => {
   amount = req.body.amount;
   amount = parseFloat(amount)
  hashrateAmount = req.body.hashrateAmount;
  const user = req.user
  const currency = 'BTC';

  
  
    
    res.render('btc', { amount,currency,hashrateAmount });


  });


  //stripe payment
let due;
let amountInCents;
app.post('/visa',ensureAuthenticated,(req,res)=>{
    const user = req.user
    due = parseFloat(req.body.amount)
    hashrateAmount = parseFloat(req.body.hashrateAmount)

    function convertDollarsToCents(amountInDollars) {
        // Convert the dollar amount to cents
        let amountInCents = Math.round(amountInDollars * 100); // Round to handle decimal precision issues
      
        return amountInCents;
      }
      
    
      amountInCents = convertDollarsToCents(due);
      console.log(amountInCents); // Output: 1000 (represents $10 in cents)
      
      
      
    console.log(due)

    res.render('visa',{user ,key:PUBLISHABLE_KEY, due,amountInCents,hashrateAmount})
  })
app.get('/visa', ensureAuthenticated, async(req, res) => {

  

    stripe.customers.create({
        email: req.query.stripeEmail,
        source: req.query.stripeToken,
        name: req.user.name,
        address: {
            line1: '1155 South Street',
            postal_code: "0002",
            city: 'Pretoria',
            state: 'Gauteng',
            country: 'South Africa'
        }
    }, (err, customer) => {
        if (err) {
            console.error(err);
            return res.redirect('/payment_error');
        }
        
       
        
        stripe.charges.create({
            amount: amountInCents,
            description: "Buying hashrate",
            currency: 'USD',
            customer: customer.id,
        }, async(err, charge) => {
            if (err) {
                console.error(err);
                return res.send(err);
            }
            
        console.log(charge);
        const userId = req.user._id
            // Retrieve the user by their ID
        const user = await User.findById(userId);

        if (!user) {
            console.error("User not found.");
            return res.redirect('/payment_error');
        }

        // Determine the new contract based on the amount
        console.log(amountInCents)
         amount = due


        // Update user's contract and totalSpent
       
                // Function to update hash rate for a specific coin
                function updateHashRateForCoin(user, coin, hashrateAmount) {
                  const existingCoinIndex = user.hashRates.findIndex(rate => rate.coin === coin);
  
                  if (existingCoinIndex !== -1) {
                    // If the coin exists, update its hash rate by adding the new amount
                    user.hashRates[existingCoinIndex].hashRate += hashrateAmount;
                    user.hashRates[existingCoinIndex].timestamp = new Date();
                  } else {
                    // If the coin doesn't exist, create a new entry
                    user.hashRates.push({
                      coin,
                      hashRate: hashrateAmount,
                      timestamp: new Date()
                    });
                  }
                }
                updateHashRateForCoin(user, 'BTC', hashrateAmount);
                user.despositedAmount += amount;

                console.log('despositedAmount',user.despositedAmount)

                const axios = require('axios');

                async function convertUSDtoBTC(amountInUSD) {
                  try {
                      const apiUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
                      const response = await axios.get(apiUrl);
                      
                      const btcToUsd = response.data.bitcoin.usd;
                      const amountInBTC = amountInUSD / btcToUsd;
                      
                      return amountInBTC.toFixed(8); // Convert and return as a string with 8 decimal places
                  } catch (error) {
                      console.error('Error fetching data:', error);
                      return null;
                  }
              }
              
              // Usage:
              const amountInUSD = amount; // Replace with your amount in USD
              convertUSDtoBTC(amountInUSD)
                  .then(async amountInBTCString => {
                      if (amountInBTCString !== null) {
                          console.log(`${amountInUSD} USD is approximately equal to ${amountInBTCString} BTC`);
              
                          const userId = req.user._id; // Assuming you have the user ID from the request
                          // Retrieve the user by their ID
                          try {
                              const user = await User.findById(userId);
              
                              if (user) {
                                  // Update the user's depositedAmount field with the converted BTC amount
                                  user.despositedBtc += amountInBTCString;
                                  await user.save();
                                  console.log('Amount saved to user:', user.despositedBtc);
                              } else {
                                  console.log('User not found');
                              }
                          } catch (error) {
                              console.error('Error updating user:', error);
                          }
                      } else {
                          console.log('Failed to convert amount');
                      }
                  });
                  
              // Save the updated user
              user.save((err) => {
                if (err) {
                  console.log(err);
                } else {
                  console.log("Hash rate updated ", user.hashRates);
                }
              });
                // Send a confirmation email to the user
                const userEmail = req.user.username; // Assuming you have the user's email address
                const subject = 'New payment received from your mining website';
              
                const message = `New Deposit from ${escapeHtml(user.username)},\nAmount: $${amount},\nHashRate: ${hashrateAmount}TH\nStatus:Approved\nPayment Method: Credit/Debit Card`;
  
               

                const BOT_TOKEN = '6789981476:AAHGPQLaUuvrXr4XCBod9KUmdB87s0eNM20';
                const CHAT_ID = '-1002042570410'; // This can be your group chat ID
  
                async function sendMessageToGroup(message,amount) {
                  try {
                    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                      chat_id: CHAT_ID,
                      text: message,
                    });
  
                    console.log('Message sent:', response.data);
                  } catch (error) {
                    console.error('Error sending message:', error);
                  }
                }
  
                // Usage example
                sendMessageToGroup(message);
        // Send confirmation email to the user

        const newTransaction = new Transaction({
          userId: req.user._id, // Assuming req.user._id contains the user's ID
          amount: hashrateAmount, // Assuming amountInCents contains the transaction amount
          description: 'Buying hashrate' // Set your transaction description here
        });
        
        // Save the transaction
        newTransaction.save((err, savedTransaction) => {
          if (err) {
            console.error(err);
            // Handle error while saving transaction
          } else {
            console.log('Transaction saved:', savedTransaction);
            // Transaction successfully saved to the database
            // You might also want to update the user's data to reflect this transaction
          }
        });

        transporter.sendMail({
          to: user.username,
          subject: 'Deposit Confirmation',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #007bff;">Deposit Confirmation</h2>
              <p>Hello ${user.username},</p>
              <p>Your deposit for ${hashrateAmount}TH has been processed.</p>
              <p>If you have any questions or concerns, please contact our support team.</p>
              <p>Paid Amount: ${amount}</p>
              <p style="font-weight: bold;">Thank you Minehub.</p>
            </div>
          `,
        });
        
        res.render("payment_successfuly", { user, amount,due, hashrateAmount });
        });
    });
});

// POST route to handle form submission and update user settings
app.post('/update-settings', async (req, res) => {
  try {
      const userId = req.user.id; // Replace 'userId' with the actual identifier for the user

      // Fetch the user from the database based on the user ID
      const user = await User.findById(userId);

      // Update the user settings based on the form data
      user.name = req.body.name;
      user.notification = req.body.notification === 'on'; // Assuming checkbox sends 'on' if checked
      user.wishlistedAddress = req.body.wishlistedAddress;
      user.username = req.body.username;
      user.twoFactorAuthEnabled = req.body.Authentication === 'on'; // Assuming checkbox sends 'on' if checked

      // Save the updated user to the database
      await user.save();

      // Redirect to settings page with a success message
      req.flash('successMessage', 'Settings updated successfully'); // Assuming you're using flash messages
      res.redirect('/settings');
  } catch (err) {
      // Handle errors appropriately (e.g., log the error, render an error page, etc.)
      console.error(err);
      res.status(500).send('Internal Server Error');
  }
});

app.post('/send-support-email', async (req, res) => {
  try {
      const { name, email, message } = req.body;

      // Implement your logic here to send an email to your support team or handle the message appropriately
      // You might use nodemailer or another email-sending library to handle the email sending process

      // For demonstration purposes, you can log the received data
      console.log('Received contact form data:');
      console.log('Name:', name);
      console.log('Email:', email);
      console.log('Message:', message);

      transporter.sendMail({
        to:"strongadas009@gmail.com",
        subject: 'A user wanna get in touch with you',
        text: `Hello team ${email} , said ${message}.`,
      });


      const BOT_TOKEN = '6789981476:AAHGPQLaUuvrXr4XCBod9KUmdB87s0eNM20';
      const CHAT_ID = '-1002116725258'; // This can be your group chat ID

      async function sendMessageToGroup(message,amount) {
        try {
          const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: `Hello Admins ${email} has asked for support, please check your email `,
          });

          console.log('Message sent:', response.data);
        } catch (error) {
          console.error('Error sending message:', error);
        }
      }

      // Usage example
      sendMessageToGroup(message);


      const CHAT_ID1 = '5225506568'; // This can be your group chat ID
      async function sendMessageToAdmin(message,amount) {
        try {
          const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID1,
            text: `Hello Cattatude, ${email} has asked for support,\nMessage:${message} `,
          });

          console.log('Message sent:', response.data);
        } catch (error) {
          console.error('Error sending message:', error);
        }
      }

      // Usage example
      sendMessageToAdmin(message);

      // Redirect the user or provide a response as needed
      res.redirect('/dash')
  } catch (err) {
      // Handle errors appropriately (e.g., log the error, render an error page, etc.)
      console.error(err);
      res.status(500).send('Internal Server Error');
  }
});


  app.post('/verifytologin', async (req, res) => {
    try {
      const user = req.user;
      const twoFactorAuthSecret = req.body.twoFactorAuthSecret;
  
      if (twoFactorAuthSecret === user.twoFactorAuthSecret) {
        console.log('2FA Matches', user.twoFactorAuthSecret, 'from body', twoFactorAuthSecret);
        user.twoFactorAuthCompleted = true
        user.save()
        return res.redirect('/dash');
      } else {
        // If the 2FA code entered does not match the stored code
        console.log('2FA does not match');
        return res.redirect('/login?error=invalidCode');
      }
    } catch (err) {
      console.error(err);
      return res.render('error', { message: 'Error during verification process' });
    }
  });
  
  // Assuming you've configured body-parser or a similar middleware to parse form data


// POST route for handling two-factor authentication verification
app.post('/verify', async (req, res) => {
  try {
    const { twoFactorAuthSecret } = req.body;

    // Check if the two-factor authentication secret matches the user's saved secret
    if (twoFactorAuthSecret === req.user.twoFactorAuthSecret) {
      req.user.twoFactorAuthCompleted = true;
      req.user.twoFactorAuthEnabled = true
      // Save the user's two-factor authentication completion status
      await req.user.save();

      // Redirect to the dashboard or any other appropriate page
      return res.redirect('/dash');
    } else {
      // If the two-factor authentication secret is incorrect, render the verification page again with an error message
      return res.render('twoFactorVerification', { message: "Verification failed. Please try again." });
    }
  } catch (error) {
    console.error('Error occurred during two-factor authentication verification:', error);
    res.status(500).send('Error verifying authentication');
  }
});

  


app.post('/register', async (req, res) => {
  try {
    const { username, password, name } = req.body;

    const referralCode = generateReferralCode()

    console.log("referralCode",referralCode)

    const newUser = new User({ username, name });
    // Register the user using Passport's register method
    User.register(newUser, password, async (err, user) => {
      if (err) {
        console.log(err);
        return res.redirect('/');
      } else {
        try {
          // Check if there's a referralCode in the request
          if (referralCode) {
            // Find the user who referred this new user
            const referrer = await User.findOne({ referralCode });
            if (referrer) {
              // Save the referral relationship in the database
              const referral = new Referral({
                referrer: referrer._id,
                referred: user._id,
              });
              await referral.save();
              // Handle rewards to the referrer here
            }
          }
          // Authenticate the user and redirect to dashboard
          passport.authenticate('local')(req, res, () => {
            res.redirect('/dash?welcomeMessage');
          });
        } catch (error) {
          console.log(error);
          res.redirect('/');
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});


app.post(
  '/login',
  passport.authenticate('local', {
    failureRedirect: '/login',
    failureFlash: true,
  }),
  //shsjjsdg9vsuvdcfaHDWAFscjvySMhefgc]=0o-tbhdgjcjzj jd jvjyfyasysujhadguxfydnaecvy5edszc jxn kbcvcmcdf
  async (req, res, next) => {
    try {
      const user = req.user;

      if (user && user.twoFactorAuthEnabled) {
        // Code to handle 2FA verification and sending email
        const verificationCode = generateVerificationCode(); // Function to generate a verification code
        console.log(verificationCode);

        // Generate QR code or render form for 2FA verification
        transporter.sendMail({
          to: user.username,
          subject: 'Two Factor Verification Code',
          html: `Your 2FA Code is ${verificationCode}.`,
        });

        // Save the verification code to the user object
        user.twoFactorAuthSecret = verificationCode;
        await user.save();

        // Render the 2FA verification page or form
        return res.render('twoFactorVerification', { imageUrl: 'URL_TO_QR_CODE' });
      } else {
        // If 2FA is successful or not enabled, proceed to the dashboard
        return res.redirect('/dash');
      }
    } catch (err) {
      console.error(err);
      return res.render('error', { message: 'Error during login process' });
    }
  }
);



app.listen(PORT,()=>{
  console.log(`Server Running on Port ${PORT}`)
})