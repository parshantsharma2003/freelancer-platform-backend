module.exports = {
  async up(db) {
    await db.collection('users').updateMany(
      { accountStatus: { $exists: false } },
      {
        $set: {
          accountStatus: 'active',
          emailVerified: false,
          phoneVerified: false,
          credits: 10
        }
      }
    );
  },

  async down(db) {
    await db.collection('users').updateMany(
      {},
      {
        $unset: {
          accountStatus: '',
          emailVerified: '',
          phoneVerified: '',
          credits: ''
        }
      }
    );
  }
};
