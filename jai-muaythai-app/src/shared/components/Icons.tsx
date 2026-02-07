import React from 'react';
import { Ionicons, MaterialCommunityIcons, FontAwesome5, Feather } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';

interface IconProps {
  size?: number;
  color?: string;
}

// Navigation & Tab Icons
export const HomeIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="home" size={size} color={color} />
);

export const HomeOutlineIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="home-outline" size={size} color={color} />
);

export const CalendarIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="calendar" size={size} color={color} />
);

export const CalendarOutlineIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="calendar-outline" size={size} color={color} />
);

export const PeopleIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="people" size={size} color={color} />
);

export const PeopleOutlineIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="people-outline" size={size} color={color} />
);

export const WalletIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="wallet" size={size} color={color} />
);

export const WalletOutlineIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="wallet-outline" size={size} color={color} />
);

// Header Icons
export const NotificationIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="notifications" size={size} color={color} />
);

export const NotificationOutlineIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="notifications-outline" size={size} color={color} />
);

export const BroadcastIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="megaphone" size={size} color={color} />
);

export const BroadcastOutlineIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="megaphone-outline" size={size} color={color} />
);

export const BackIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="chevron-back" size={size} color={color} />
);

export const CloseIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="close" size={size} color={color} />
);

// Action Icons
export const AddIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="add" size={size} color={color} />
);

export const EditIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Feather name="edit-2" size={size} color={color} />
);

export const DeleteIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="trash-outline" size={size} color={color} />
);

export const CheckIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="checkmark" size={size} color={color} />
);

export const CheckCircleIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="checkmark-circle" size={size} color={color} />
);

// Notification Type Icons
export const LeaveIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="document-text" size={size} color={color} />
);

export const ClassIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <MaterialCommunityIcons name="boxing-glove" size={size} color={color} />
);

export const SystemIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="settings" size={size} color={color} />
);

export const BookingIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="calendar-number" size={size} color={color} />
);

// Status Icons
export const SuccessIcon = ({ size = 24, color = Colors.success }: IconProps) => (
  <Ionicons name="checkmark-circle" size={size} color={color} />
);

export const ErrorIcon = ({ size = 24, color = Colors.error }: IconProps) => (
  <Ionicons name="close-circle" size={size} color={color} />
);

export const WarningIcon = ({ size = 24, color = Colors.warning }: IconProps) => (
  <Ionicons name="warning" size={size} color={color} />
);

export const PendingIcon = ({ size = 24, color = Colors.warning }: IconProps) => (
  <Ionicons name="time" size={size} color={color} />
);

// Empty State Icons
export const EmptyNotificationIcon = ({ size = 48, color = Colors.darkGray }: IconProps) => (
  <Ionicons name="notifications-off-outline" size={size} color={color} />
);

export const EmptyCalendarIcon = ({ size = 48, color = Colors.darkGray }: IconProps) => (
  <Ionicons name="calendar-outline" size={size} color={color} />
);

export const EmptyPeopleIcon = ({ size = 48, color = Colors.darkGray }: IconProps) => (
  <Ionicons name="people-outline" size={size} color={color} />
);

// Profile & User Icons
export const PersonIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="person" size={size} color={color} />
);

export const PersonOutlineIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="person-outline" size={size} color={color} />
);

export const LogoutIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="log-out-outline" size={size} color={color} />
);

// Misc Icons
export const TimeIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="time-outline" size={size} color={color} />
);

export const LocationIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="location-outline" size={size} color={color} />
);

export const PhoneIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="call-outline" size={size} color={color} />
);

export const EmailIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="mail-outline" size={size} color={color} />
);

export const FilterIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="filter" size={size} color={color} />
);

export const SearchIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="search" size={size} color={color} />
);

export const RefreshIcon = ({ size = 24, color = Colors.white }: IconProps) => (
  <Ionicons name="refresh" size={size} color={color} />
);
