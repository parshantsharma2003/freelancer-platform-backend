import { body, param, query, validationResult } from 'express-validator';

// Validation result checker
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// User registration validation
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

// Login validation
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

// Job creation validation
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
    .isIn(['less-than-week', '1-2-weeks', '2-4-weeks', '1-3-months', '3-6-months', '6+ months'])
    .withMessage('Invalid duration'),
  body('experienceLevel')
    .isIn(['entry', 'intermediate', 'expert'])
    .withMessage('Invalid experience level'),
  validate
];

// Proposal validation
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

// MongoDB ObjectId validation
export const objectIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID format'),
  validate
];

// Pagination validation
export const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  validate
];
