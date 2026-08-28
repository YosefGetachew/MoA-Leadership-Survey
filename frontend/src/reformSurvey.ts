export const overallReformQuestions = [
  {
    code: "OR01",
    dimension: "Awareness",
    text: "I understand the objectives and intended results of the institutional reform.",
    textAm: "የተቋማዊ ሪፎርሙን ዓላማዎችና የሚጠበቁ ውጤቶች በግልጽ እረዳለሁ።",
  },
  {
    code: "OR02",
    dimension: "Relevance",
    text: "The reform priorities are relevant to the institution's responsibilities and current needs.",
    textAm: "የሪፎርሙ ቅድሚያዎች ከተቋሙ ኃላፊነቶችና ወቅታዊ ፍላጎቶች ጋር ተዛማጅ ናቸው።",
  },
  {
    code: "OR03",
    dimension: "Implementation",
    text: "The planned reform activities are being implemented as intended.",
    textAm: "የታቀዱት የሪፎርም ተግባራት በታሰበው መሠረት ተግባራዊ እየሆኑ ነው።",
  },
  {
    code: "OR04",
    dimension: "Leadership",
    text: "Leaders provide clear direction, ownership and support for implementation of the reform.",
    textAm: "አመራሮች ለሪፎርሙ አፈጻጸም ግልጽ አቅጣጫ፣ ባለቤትነትና ድጋፍ ይሰጣሉ።",
  },
  {
    code: "OR05",
    dimension: "Communication",
    text: "Information about reform decisions, progress and expectations is communicated clearly and on time.",
    textAm: "ስለ ሪፎርም ውሳኔዎች፣ እድገትና የሚጠበቁ ተግባራት መረጃ በግልጽና በወቅቱ ይተላለፋል።",
  },
  {
    code: "OR06",
    dimension: "Impact",
    text: "The reform has produced positive and measurable improvements in institutional performance.",
    textAm: "ሪፎርሙ በተቋሙ አፈጻጸም ላይ አዎንታዊና ሊለካ የሚችል መሻሻል አስገኝቷል።",
  },
  {
    code: "OR07",
    dimension: "Overall assessment",
    text: "Overall, I am satisfied with the progress and results of the institutional reform.",
    textAm: "በአጠቃላይ በተቋማዊ ሪፎርሙ እድገትና ውጤቶች ረክቻለሁ።",
  },
] as const;

export const evaluatedSectorOptions = [
  { value: "crop_development", label: "Crop Development", labelAm: "የሰብል ልማት" },
  { value: "livestock_development", label: "Livestock Development", labelAm: "የእንስሳት ልማት" },
  { value: "agricultural_extension", label: "Agricultural Extension", labelAm: "የግብርና ኤክስቴንሽን" },
  { value: "natural_resources", label: "Natural Resources Management", labelAm: "የተፈጥሮ ሀብት አስተዳደር" },
  { value: "irrigation_development", label: "Irrigation Development", labelAm: "የመስኖ ልማት" },
  { value: "inputs_mechanization", label: "Agricultural Inputs and Mechanization", labelAm: "የግብርና ግብዓትና ሜካናይዜሽን" },
  { value: "agricultural_marketing", label: "Agricultural Marketing", labelAm: "የግብርና ግብይት" },
  { value: "food_nutrition_security", label: "Food and Nutrition Security", labelAm: "የምግብና ሥነ ምግብ ዋስትና" },
  { value: "planning_policy_monitoring", label: "Planning, Policy and Monitoring", labelAm: "ዕቅድ፣ ፖሊሲና ክትትል" },
  { value: "research_innovation", label: "Research and Innovation", labelAm: "ምርምርና ፈጠራ" },
  { value: "administration_enabling", label: "Administration and Enabling Services", labelAm: "አስተዳደርና ድጋፍ ሰጪ አገልግሎቶች" },
  { value: "regional_agriculture", label: "Regional Agriculture Bureau / Office", labelAm: "የክልል ግብርና ቢሮ / ጽሕፈት ቤት" },
  { value: "accountable_institution", label: "Accountable Institution", labelAm: "ተጠሪ ተቋም" },
  { value: "project_program", label: "Project or Program", labelAm: "ፕሮጀክት ወይም ፕሮግራም" },
  { value: "other", label: "Other", labelAm: "ሌላ" },
] as const;
