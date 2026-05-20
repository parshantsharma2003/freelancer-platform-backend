import { body, param, query, validationResult } from 'express-validator';
import Joi from 'joi';

/* -------------------------------------------------------------------------- */
/*                         VALIDATION RESULT HANDLER                          */
/* -------------------------------------------------------------------------- */

export const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const parsedErrors = errors.array().map(err => ({
      field: err.path,
      message: err.msg
    }));

    return res.status(400).json({
      status: 'error',
      message: parsedErrors[0]?.message || 'Validation failed',
      errors: parsedErrors
    });
  }

  next();
};

/* -------------------------------------------------------------------------- */
/*                          USER REGISTRATION VALIDATION                      */
/* -------------------------------------------------------------------------- */

export const registerValidation = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),

  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),

  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required'),

  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required'),

  body('role')
    .optional()
    .isIn(['client', 'freelancer'])
    .withMessage('Role must be either client or freelancer'),

  body('provider')
    .optional()
    .isIn(['google', 'github', 'linkedin', 'apple', 'facebook'])
    .withMessage('Unsupported OAuth provider'),

  validate
];

/* -------------------------------------------------------------------------- */
/*                 SECURE REGISTRATION VALIDATION (JOI - PRIMARY)             */
/* -------------------------------------------------------------------------- */

const secureRegistrationSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(100).optional().messages({
    'string.empty': 'Full name is required',
    'string.min': 'Full name must be at least 2 characters',
  }),
  firstName: Joi.string().trim().min(1).max(60).optional(),
  lastName: Joi.string().trim().min(1).max(60).optional(),
  email: Joi.string().trim().email().required().messages({
    'string.email': 'Please provide a valid email',
    'any.required': 'Email is required',
  }),
  phone: Joi.string()
    .trim()
    .pattern(/^\+?[1-9]\d{7,14}$/)
    .optional()
    .allow('', null)
    .messages({
      'string.pattern.base': 'Please provide a valid phone number in international format',
    }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base': 'Password must include uppercase, lowercase, and a number',
      'any.required': 'Password is required',
    }),
  confirmPassword: Joi.string().valid(Joi.ref('password')).optional().messages({
    'any.only': 'Confirm password must match password',
  }),
  role: Joi.string().valid('client', 'freelancer').required().messages({
    'any.only': 'Role must be either client or freelancer',
    'any.required': 'Role is required',
  }),
}).custom((value, helpers) => {
  const hasFullName = typeof value.fullName === 'string' && value.fullName.trim().length > 0;
  const hasFirstLast =
    typeof value.firstName === 'string' && value.firstName.trim().length > 0 &&
    typeof value.lastName === 'string' && value.lastName.trim().length > 0;

  if (!hasFullName && !hasFirstLast) {
    return helpers.error('any.custom', { message: 'Provide fullName or firstName + lastName' });
  }

  if (value.confirmPassword !== undefined && value.confirmPassword !== value.password) {
    return helpers.error('any.only', { path: ['confirmPassword'] });
  }

  return value;
}, 'Name validation').messages({
  'any.custom': '{{#message}}',
});

export const secureRegisterValidation = (req, res, next) => {
  const { error, value } = secureRegistrationSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const parsedErrors = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }));

    return res.status(400).json({
      status: 'error',
      message: parsedErrors[0]?.message || 'Validation failed',
      errors: parsedErrors,
    });
  }

  req.body = value;
  next();
};

/* -------------------------------------------------------------------------- */
/*                             LOGIN VALIDATION                               */
/* -------------------------------------------------------------------------- */

export const loginValidation = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),

  body('identifier')
    .optional()
    .isString(),

  body('password')
    .optional()
    .isString()
    .withMessage('Password is required'),

  body('provider')
    .optional()
    .isIn(['google', 'github', 'linkedin', 'apple', 'facebook'])
    .withMessage('Unsupported OAuth provider'),

  validate
];

/* -------------------------------------------------------------------------- */
/*                          JOB CREATION VALIDATION                           */
/* -------------------------------------------------------------------------- */

export const jobValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Job title is required')
    .isLength({ max: 100 })
    .withMessage('Title must not exceed 100 characters'),

  body('description')
    .trim()
    .notEmpty()
    .withMessage('Job description is required')
    .isLength({ max: 5000 })
    .withMessage('Description must not exceed 5000 characters'),

  body('category')
    .trim()
    .notEmpty()
    .withMessage('Category is required'),

  body('budget.type')
    .isIn(['fixed', 'hourly'])
    .withMessage('Budget type must be either fixed or hourly'),

  body('budget.amount')
    .optional()
    .isNumeric()
    .withMessage('Budget amount must be a number')
    .custom(value => value >= 0)
    .withMessage('Budget amount must be positive'),

  body('budget.minAmount')
    .optional()
    .isNumeric()
    .withMessage('Min budget must be a number')
    .custom(value => value >= 0)
    .withMessage('Min budget must be positive'),

  body('budget.maxAmount')
    .optional()
    .isNumeric()
    .withMessage('Max budget must be a number')
    .custom(value => value >= 0)
    .withMessage('Max budget must be positive'),

  body('duration')
    .isIn([
      'less-than-week',
      '1-2-weeks',
      '2-4-weeks',
      '1-3-months',
      '3-6-months',
      '6+ months'
    ])
    .withMessage('Invalid duration'),

  body('experienceLevel')
    .isIn(['entry', 'intermediate', 'expert'])
    .withMessage('Invalid experience level'),

  validate
];

/* -------------------------------------------------------------------------- */
/*                          PROPOSAL VALIDATION                               */
/* -------------------------------------------------------------------------- */

export const proposalValidation = [
  body('coverLetter')
    .trim()
    .notEmpty()
    .withMessage('Cover letter is required')
    .isLength({ max: 2000 })
    .withMessage('Cover letter must not exceed 2000 characters'),

  body('proposedBudget.amount')
    .isNumeric()
    .withMessage('Proposed budget must be a number')
    .custom(value => value > 0)
    .withMessage('Proposed budget must be greater than 0'),

  body('proposedBudget.type')
    .isIn(['fixed', 'hourly'])
    .withMessage('Budget type must be either fixed or hourly'),

  validate
];

/* -------------------------------------------------------------------------- */
/*                        MONGODB OBJECT ID VALIDATION                        */
/* -------------------------------------------------------------------------- */

export const objectIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),

  validate
];

export const jobIdValidation = [
  param('jobId')
    .isMongoId()
    .withMessage('Invalid job ID format'),

  validate
];

/* -------------------------------------------------------------------------- */
/*                         PAGINATION VALIDATION                              */
/* -------------------------------------------------------------------------- */

export const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('Limit must be between 1 and 200'),

  validate
];