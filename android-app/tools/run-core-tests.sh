successfully downloaded text file (SHA: df9eaab61c05dce60c1fbd18fa2b0713edecc38c)

# UI feedback timing policy (cherry-picked from feat/ui-feedback-policy-20261031).
javac -encoding UTF-8 --release 17 -d "$BUILD_DIR" \
  "$ROOT/app/src/main/java/com/abrar/daymark/UiFeedbackPolicy.java" \
  "$ROOT/tools/UiFeedbackPolicySmoke.java"
java -ea -cp "$BUILD_DIR" com.abrar.daymark.UiFeedbackPolicySmoke
