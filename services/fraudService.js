export const calculateRiskScore = user => {

  let score = 0;
  const email = String(user?.email || "");

  if (email.includes("temp")) {
    score += 40;
  }

  if (
    user?.createdAt &&
    Date.now() - new Date(user.createdAt) < 24 * 60 * 60 * 1000
  ) {
    score += 20;
  }

  if ((user?.disputes || 0) > 3) {
    score += 30;
  }

  if ((user?.totalProposals || 0) > 100 && (user?.totalJobs || 0) === 0) {
    score += 20;
  }

  return Math.min(score,100);

};