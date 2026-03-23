export interface PlanModel {
  id: string;
  name: string;
}

export interface PlanTool {
  id: string;
  name: string;
  desc: string;
}

export interface Plan {
  name: string;
  model: PlanModel;
  prompt: string;
  tools?: PlanTool[];
  subPlans?: Plan[];
}

export interface PlanningContent {
  planId: string;
  plans: Plan[];
}
