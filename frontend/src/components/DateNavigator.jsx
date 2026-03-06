import React, { useState } from 'react';
import { Button } from './Button';
import { Calendar, Clock, Filter } from 'lucide-react';
import './DateNavigator.css';

export const DateNavigator = ({ onDateChange, selectedRange }) => {
    const [activeFilter, setActiveFilter] = useState(selectedRange?.filter || 'month');
    const [showCustom, setShowCustom] = useState(false);
    const [customDate, setCustomDate] = useState('');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    const handleQuickFilter = (filter) => {
        setActiveFilter(filter);
        setShowCustom(false);

        const today = new Date();
        let days;

        switch (filter) {
            case 'today':
                days = 1;
                break;
            case 'yesterday':
                days = 1;
                break;
            case 'week':
                days = 7;
                break;
            case 'month':
                days = 30;
                break;
            case 'all':
                days = 365;
                break;
            default:
                days = 1;
        }

        onDateChange({ days, filter });
    };

    const handleCustomDate = () => {
        setShowCustom(!showCustom);
        setActiveFilter('custom');
    };

    const handleDateSubmit = () => {
        if (customDate) {
            onDateChange({ date: customDate, filter: 'custom', days: 1 });
        } else if (dateRange.start && dateRange.end) {
            onDateChange({
                start_date: dateRange.start,
                end_date: dateRange.end,
                filter: 'custom',
            });
        }
    };

    const quickFilters = [
        { id: 'today', label: 'Today', icon: Clock },
        { id: 'yesterday', label: 'Yesterday', icon: Clock },
        { id: 'week', label: 'Last 7 Days', icon: Calendar },
        { id: 'month', label: 'Last 30 Days', icon: Calendar },
        { id: 'all', label: 'All Time', icon: Filter },
    ];

    return (
        <div className="date-navigator">
            <div className="quick-filters">
                {quickFilters.map(filter => (
                    <Button
                        key={filter.id}
                        variant={activeFilter === filter.id ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => handleQuickFilter(filter.id)}
                    >
                        <filter.icon size={16} />
                        {filter.label}
                    </Button>
                ))}
                <Button
                    variant={activeFilter === 'custom' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={handleCustomDate}
                >
                    <Calendar size={16} />
                    Custom
                </Button>
            </div>

            {showCustom && (
                <div className="custom-date-picker">
                    <div className="date-input-group">
                        <label>
                            Single Date:
                            <input
                                type="date"
                                value={customDate}
                                onChange={(e) => {
                                    setCustomDate(e.target.value);
                                    setDateRange({ start: '', end: '' });
                                }}
                                className="date-input"
                            />
                        </label>
                    </div>

                    <div className="date-separator">OR</div>

                    <div className="date-range-group">
                        <label>
                            From:
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => {
                                    setDateRange({ ...dateRange, start: e.target.value });
                                    setCustomDate('');
                                }}
                                className="date-input"
                            />
                        </label>
                        <label>
                            To:
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => {
                                    setDateRange({ ...dateRange, end: e.target.value });
                                    setCustomDate('');
                                }}
                                className="date-input"
                            />
                        </label>
                    </div>

                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleDateSubmit}
                        disabled={!customDate && !(dateRange.start && dateRange.end)}
                    >
                        Apply
                    </Button>
                </div>
            )}
        </div>
    );
};
