import type { Decision, ItemCategory, ItemCondition } from './item';

export interface IdentifyRequest {
  image: string; // base64
}

export interface IdentifyResponse {
  itemName: string;
  category: ItemCategory;
  condition: ItemCondition;
  description: string;
}

export interface ServicesRequest {
  itemName: string;
  category: ItemCategory;
  condition: ItemCondition;
  decision: Decision;
  location: string;
}

export interface ServiceOption {
  name: string;
  description: string;
  url: string;
  phone?: string;
  address?: string;
}

export interface ServicesResponse {
  services: ServiceOption[];
}

export interface ScheduleRequest {
  serviceName: string;
  itemName: string;
  decision: string;
  date: string;
}

export interface ScheduleResponse {
  confirmation: string;
  scheduledAction: string;
}
