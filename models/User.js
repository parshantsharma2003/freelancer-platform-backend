import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"]
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },

    password: {
      type: String,
      required: function () {
        return !this.oauthProviders || this.oauthProviders.length === 0;
      },
      minlength: 6,
      select: false
    },

    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true
    },

    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true
    },

    role: {
      type: String,
      enum: ["client", "freelancer", "super_admin"],
      default: "client"
    },

    accountStatus: {
      type: String,
      enum: ["pending_verification", "active", "suspended", "closed"],
      default: "pending_verification"
    },

    statusReason: {
      type: String,
      trim: true
    },

    avatar: {
      type: String,
      default: null
    },

    isVerified: {
      type: Boolean,
      default: false
    },

    emailVerified: {
      type: Boolean,
      default: false
    },

    phoneVerified: {
      type: Boolean,
      default: false
    },

    emailVerification: {
      tokenHash: String,
      expiresAt: Date,
      verifiedAt: Date
    },

    phoneVerification: {
      codeHash: String,
      expiresAt: Date,
      verifiedAt: Date
    },

    passwordReset: {
      token: String,
      expiresAt: Date
    },

    oauthProviders: [
      {
        provider: {
          type: String,
          enum: ["google", "github", "linkedin", "apple", "facebook"]
        },
        providerUserId: String,
        email: String,
        linkedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],

    /*
    |--------------------------------------------------------------------------
    | Security: Login Protection & Fraud Detection
    |--------------------------------------------------------------------------
    */

    loginAttempts: {
      type: Number,
      default: 0
    },

    lockUntil: Date,

    fraud: {
      riskScore: {
        type: Number,
        default: 0
      },
      flagged: {
        type: Boolean,
        default: false
      }
    },

    /*
    |--------------------------------------------------------------------------
    | KYC
    |--------------------------------------------------------------------------
    */

    kyc: {
      status: {
        type: String,
        enum: ["not_started", "pending", "verified", "rejected"],
        default: "not_started"
      },
      provider: String,
      reference: String,
      verifiedAt: Date,
      updatedAt: Date
    },

    isActive: {
      type: Boolean,
      default: true
    },

    lastLogin: {
      type: Date,
      default: null
    },

    lastLoginIp: String,

    lastLoginUserAgent: String,

    /*
    |--------------------------------------------------------------------------
    | Refresh Token (Hashed)
    |--------------------------------------------------------------------------
    */

    refreshToken: {
      type: String,
      select: false
    },

    profileCompleteness: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    credits: {
      type: Number,
      default: 10,
      min: 0
    },

    wallet: {
      availableBalance: {
        type: Number,
        default: 0,
        min: 0
      },
      pendingBalance: {
        type: Number,
        default: 0,
        min: 0
      },
      totalEarnings: {
        type: Number,
        default: 0,
        min: 0
      },
      lastUpdatedAt: Date
    },

    savedJobs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Job"
      }
    ],

    /*
    |--------------------------------------------------------------------------
    | Stripe Connect
    |--------------------------------------------------------------------------
    */

    stripeConnect: {
      accountId: String,

      status: {
        type: String,
        enum: ["not_started", "pending", "verified", "rejected"],
        default: "not_started"
      },

      detailsSubmitted: {
        type: Boolean,
        default: false
      },

      chargesEnabled: {
        type: Boolean,
        default: false
      },

      payoutsEnabled: {
        type: Boolean,
        default: false
      },

      onboardedAt: Date,

      updatedAt: Date
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

/*
|--------------------------------------------------------------------------
| Virtual: Full Name
|--------------------------------------------------------------------------
*/

userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// One provider identity must map to only one user across the platform.
userSchema.index(
  { "oauthProviders.provider": 1, "oauthProviders.providerUserId": 1 },
  { unique: true, sparse: true }
);

/*
|--------------------------------------------------------------------------
| Password Hashing
|--------------------------------------------------------------------------
*/

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);

  next();
});

/*
|--------------------------------------------------------------------------
| Compare Password
|--------------------------------------------------------------------------
*/

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword || !this.password) {
    return false;
  }

  return bcrypt.compare(candidatePassword, this.password);
};

/*
|--------------------------------------------------------------------------
| Login Lock Protection
|--------------------------------------------------------------------------
*/

userSchema.methods.incLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  if (this.loginAttempts + 1 >= 5 && !this.lockUntil) {
    updates.$set = {
      lockUntil: Date.now() + 15 * 60 * 1000
    };
  }

  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = async function () {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 }
  });
};

/*
|--------------------------------------------------------------------------
| Hide Sensitive Fields
|--------------------------------------------------------------------------
*/

userSchema.methods.toJSON = function () {
  const obj = this.toObject();

  delete obj.password;
  delete obj.refreshToken;
  delete obj.emailVerification;
  delete obj.phoneVerification;
  delete obj.passwordReset;
  delete obj.__v;

  return obj;
};

const User = mongoose.model("User", userSchema);

export default User;
