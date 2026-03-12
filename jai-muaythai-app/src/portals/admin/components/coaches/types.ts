import { Payslip } from '../../../../types';

export interface Coach {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  employment_type: 'full_time' | 'part_time' | null;
  hourly_rate: number | null;
  base_salary: number | null;
  pt_commission_rate: number | null;
  solo_rate: number | null;
  buddy_rate: number | null;
  house_call_rate: number | null;
  certifications: string | null;
  start_date: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  coach_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  reason: string;
  status: string;
  created_at: string;
  coach?: {
    full_name: string;
    email: string;
  };
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const formatCurrency = (amount: number) => {
  return `S$${amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export interface AddCoachModalProps {
  visible: boolean;
  newFullName: string;
  newEmail: string;
  newPhone: string;
  newEmploymentType: 'full_time' | 'part_time';
  newHourlyRate: string;
  newBaseSalary: string;
  newStartDate: string;
  creating: boolean;
  isMasterAdmin: boolean;
  onFullNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onEmploymentTypeChange: (value: 'full_time' | 'part_time') => void;
  onHourlyRateChange: (value: string) => void;
  onBaseSalaryChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export interface EditCoachModalProps {
  visible: boolean;
  selectedCoach: Coach | null;
  editFullName: string;
  editPhone: string;
  editEmploymentType: 'full_time' | 'part_time';
  editHourlyRate: string;
  editBaseSalary: string;
  editPTCommissionRate: string;
  editSoloRate: string;
  editBuddyRate: string;
  editHouseCallRate: string;
  editCertifications: string;
  editStartDate: string;
  editEmergencyContactName: string;
  editEmergencyContactPhone: string;
  saving: boolean;
  coachPayslips: Payslip[];
  loadingPayslips: boolean;
  isMasterAdmin: boolean;
  onFullNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onEmploymentTypeChange: (value: 'full_time' | 'part_time') => void;
  onHourlyRateChange: (value: string) => void;
  onBaseSalaryChange: (value: string) => void;
  onPTCommissionRateChange: (value: string) => void;
  onSoloRateChange: (value: string) => void;
  onBuddyRateChange: (value: string) => void;
  onHouseCallRateChange: (value: string) => void;
  onCertificationsChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEmergencyContactNameChange: (value: string) => void;
  onEmergencyContactPhoneChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onGeneratePayslip: () => void;
  onViewPayslip: (payslip: Payslip) => void;
}

export interface LeaveDetailModalProps {
  visible: boolean;
  selectedLeave: LeaveRequest | null;
  approvalNotes: string;
  loading: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onNotesChange: (value: string) => void;
}

export interface CoachCardProps {
  coach: Coach;
  isMasterAdmin: boolean;
  onPress: (coach: Coach) => void;
}
