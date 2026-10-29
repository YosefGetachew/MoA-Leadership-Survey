const GENERAL_QUESTIONS = [
  { code: 'A1', textEn: "Senior, middle, and line-level leaders are actively involved in the preparation of the MoA’s annual plan.", textAm: 'ከፍተኛ፣ መካከለኛ እና የታችኛውን እርከን (የመስመር) መሪዎች በግብርና ሚኒስቴር ዓመታዊ ዕቅድ ዝግጅት ላይ በንቃት ይሳተፋሉ።' },
  { code: 'A2', textEn: 'Line-level leaders have adequate opportunities to provide direct input into the annual planning process.', textAm: 'የታችኛው እርከን (የመስመር) መሪዎች በቀጥታ በዓመታዊ ዕቅድ ዝግጅት ሂደት ውስጥ የራሳቸውን አስተያየት ለመስጠት በቂ እድሎች አሏቸው።' },
  { code: 'A3', textEn: 'The annual planning process effectively integrates perspectives and feedback across all levels of leadership and staff (senior, middle, line management, staff, regions ).', textAm: 'የዓመታዊ ዕቅድ ዝግጅት ሂደቱ በሁሉም የአመራር እና የሰራተኞች እርከኖች (ከፍተኛ፣ መካከለኛ፣ የታችኛው አስተዳደር፣ ሰራተኞች እና ክልሎች) መካከል ያሉ አመለካከቶችን እና አስተያየቶችን ውጤታማ በሆነ መንገድ ይቀናጃል።' },
  { code: 'A4', textEn: 'The annual plan is regularly assessed and corrective measures taken where /when necessary', textAm: 'ዓመታዊው ዕቅድ በመደበኛነት ይገመገማል፤ አስፈላጊ በሆነበት ጊዜ እና ቦታም የማስተካከያ እርምጃዎች ይወሰዳሉ።' },
  { code: 'B1', textEn: 'The final annual plan is clearly communicated and shared with staff across all directorates and departments.', textAm: 'የመጨረሻው ዓመታዊ ዕቅድ በግልጽ ተነግሮ በሁሉም ዳይሬክቶሬቶች እና ክፍሎች ውስጥ ካሉ ሰራተኞች ጋር ይጋራል።' },
  { code: 'B2', textEn: 'Staff members have a clear understanding of the goals, targets, and priorities outlined in the annual plan.', textAm: 'የሰራተኛ አባላት በዓመታዊው ዕቅድ ውስጥ የተቀመጡትን ግቦች፣ ዒላማዎች እና ቅድሚያ የሚሰጣቸውን ጉዳዮች ግልጽ ግንዛቤ አላቸው።' },
  { code: 'B3', textEn: 'Individual employees clearly understand their daily tasks, quarterly, and annual targets and responsibilities.', textAm: 'እያንዳንዱ ሰራተኛ የዕለት ተዕለት ተግባራቸውን፣ የሩብ ዓመት እና ዓመታዊ ዒላማዎቻቸውን እንዲሁም ኃላፊነቶቻቸውን በግልጽ ይረዳል።' },
  { code: 'B4', textEn: 'Individual employees clearly understand how their daily tasks, quarterly, and annual targets connect to the overall MoA annual plan.', textAm: 'እያንዳንዱ ሰራተኛ የዕለት ተዕለት ተግባራቸው፣ የሩብ ዓመት እና ዓመታዊ ዒላማዎቻቸው ከጠቅላላው የግብርና ሚኒስቴር ዓመታዊ ዕቅድ ጋር እንዴት እንደሚገናኙ በግልጽ ይረዳል።' },
  { code: 'B5', textEn: 'Staff is assessed based on agreed individual plans and targets.', textAm: 'ሰራተኞች በተስማሙባቸው የግል ዕቅዶች እና ዒላማዎች ላይ ተመስርተው ይገመገማሉ።' },
  { code: 'C1', textEn: 'The MoA annual plan effectively reflects the agricultural priorities and development needs of Regional States.', textAm: 'የግብርና ሚኒስቴር ዓመታዊ ዕቅድ የክልል መንግስታትን የግብርና ቅድሚያ ትኩረት ጉዳዮች እና የልማት ፍላጎቶች ውጤታማ በሆነ መንገድ ያንጸባርቃል።' },
  { code: 'C2', textEn: 'Regional priorities are gathered through systematic consultation before finalizing the national annual plan.', textAm: 'የክልል ግብርና ቅድሚያ ጉዳዮች ብሔራዊው ዓመታዊ ዕቅድ ከመጠናቀቁ በፊት ስልታዊ በሆነ ምክክር ይሰበሰባሉ።' },
  { code: 'C3', textEn: 'The strategies in the national plan provide sufficient flexibility to address regional and ecological variations.', textAm: 'በብሔራዊ ዕቅድ ውስጥ ያሉት ስልቶች ክልላዊ እና ስነ-ምህዳራዊ ልዩነቶችን ለመፍታት በቂ የመተጣጠፍ አቅም (ተለዋዋጭነት) ይሰጣሉ።' },
].map((question, index) => ({ ...question, leadershipLevel: 'general', dimension: 'MOA Annual Plan Processes', sortOrder: (index + 1) * 10, active: true }));

module.exports = { GENERAL_QUESTIONS };
